import os
import json
import logging
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
import time
from datetime import datetime
import asyncio
from contextlib import asynccontextmanager

import tritonclient.http as httpclient
from tritonclient.utils import np_to_triton_dtype
from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import redis
from redis.asyncio import Redis
import jwt
from jwt.exceptions import InvalidTokenError
import aiohttp
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import uvicorn

# --- Configuration & Constants ---
MODEL_CONFIG = {
    "bert_classifier": {
        "model_name": "bert_darkness_classifier",
        "version": "1",
        "input_name": "input_text",
        "output_name": "output_scores",
        "confidence_threshold": 0.85,
        "triton_url": os.getenv("TRITON_URL", "localhost:8000")
    },
    "gpt4o_mini": {
        "model_name": "gpt4o_mini_joke_generator",
        "version": "1",
        "input_name": "prompt",
        "output_name": "generated_text",
        "confidence_threshold": 0.75,
        "triton_url": os.getenv("TRITON_URL", "localhost:8000")
    }
}

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
RATE_LIMIT_REQUESTS_PER_MINUTE = 60

# --- Prometheus Metrics ---
REQUESTS_TOTAL = Counter('http_requests_total', 'Total HTTP Requests', ['method', 'endpoint', 'status'])
REQUEST_LATENCY = Histogram('http_request_latency_seconds', 'HTTP Request Latency', ['endpoint'])
MODEL_INFERENCE_LATENCY = Histogram('model_inference_latency_seconds', 'Model Inference Latency', ['model_name'])
LOW_CONFIDENCE_COUNTER = Counter('low_confidence_predictions_total', 'Low Confidence Predictions', ['model_name'])

# --- Pydantic Models ---
class JokeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    user_id: Optional[str] = None

class JokeResponse(BaseModel):
    joke: str
    model_used: str
    confidence: float
    needs_human_review: bool
    request_id: str

class FeedbackRequest(BaseModel):
    request_id: str
    joke: str
    user_rating: int = Field(..., ge=1, le=5)
    was_dark: bool
    adversarial_example: Optional[str] = None

# --- Authentication & Rate Limiting ---
security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_id
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

class RateLimiter:
    def __init__(self, redis_client: Redis, limit: int = RATE_LIMIT_REQUESTS_PER_MINUTE, window: int = 60):
        self.redis = redis_client
        self.limit = limit
        self.window = window

    async def is_rate_limited(self, user_id: str) -> bool:
        key = f"rate_limit:{user_id}"
        current = await self.redis.get(key)
        if current is None:
            await self.redis.setex(key, self.window, 1)
            return False
        if int(current) >= self.limit:
            return True
        await self.redis.incr(key)
        return False

# --- Triton Inference Client ---
class TritonInferenceClient:
    def __init__(self, model_config: Dict[str, Any]):
        self.model_name = model_config["model_name"]
        self.version = model_config["version"]
        self.input_name = model_config["input_name"]
        self.output_name = model_config["output_name"]
        self.triton_url = model_config["triton_url"]
        self.client = httpclient.InferenceServerClient(url=self.triton_url)

    async def infer(self, input_text: str) -> Tuple[Any, float]:
        start_time = time.time()
        inputs = [
            httpclient.InferInput(self.input_name, [1, 1], "BYTES").set_data_from_numpy(
                np.array([[input_text.encode('utf-8')]], dtype=object)
            )
        ]
        outputs = [httpclient.InferRequestedOutput(self.output_name)]
        try:
            response = self.client.infer(
                model_name=self.model_name,
                inputs=inputs,
                outputs=outputs,
                model_version=self.version
            )
            inference_time = time.time() - start_time
            MODEL_INFERENCE_LATENCY.labels(model_name=self.model_name).observe(inference_time)
            output_data = response.as_numpy(self.output_name)
            return output_data, inference_time
        except Exception as e:
            logging.error(f"Triton inference failed for {self.model_name}: {e}")
            raise HTTPException(status_code=503, detail="Model inference service unavailable")

# --- Core Service ---
class DarkJokeService:
    def __init__(self):
        self.bert_client = TritonInferenceClient(MODEL_CONFIG["bert_classifier"])
        self.gpt_client = TritonInferenceClient(MODEL_CONFIG["gpt4o_mini"])
        self.redis = redis.asyncio.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)
        self.rate_limiter = RateLimiter(self.redis)
        self.feedback_queue = asyncio.Queue()
        self.human_review_queue = asyncio.Queue()

    async def classify_darkness(self, text: str) -> Tuple[float, bool]:
        """Classify if a joke is dark using BERT."""
        output, _ = await self.bert_client.infer(text)
        confidence = float(output[0][0]) if output.ndim > 1 else float(output[0])
        is_dark = confidence >= MODEL_CONFIG["bert_classifier"]["confidence_threshold"]
        if not is_dark:
            LOW_CONFIDENCE_COUNTER.labels(model_name="bert_classifier").inc()
        return confidence, is_dark

    async def generate_joke(self, prompt: str) -> Tuple[str, float]:
        """Generate a joke using GPT-4o mini."""
        output, _ = await self.gpt_client.infer(prompt)
        generated_text = output[0].decode('utf-8') if isinstance(output[0], bytes) else str(output[0])
        confidence = 1.0  # Placeholder: GPT models don't typically output confidence scores.
        return generated_text, confidence

    async def process_request(self, prompt: str, user_id: str) -> JokeResponse:
        """Main pipeline: classify prompt, generate joke, assess output."""
        request_id = f"{user_id}_{int(time.time())}"

        # Step 1: Classify input prompt darkness intent
        darkness_confidence, is_dark_prompt = await self.classify_darkness(prompt)
        if not is_dark_prompt:
            prompt = f"dark humor joke about: {prompt}"

        # Step 2: Generate joke
        joke, gen_confidence = await self.generate_joke(prompt)

        # Step 3: Classify generated joke darkness
        final_darkness_confidence, is_dark_joke = await self.classify_darkness(joke)
        overall_confidence = min(darkness_confidence, final_darkness_confidence, gen_confidence)

        # Step 4: Determine if human review is needed
        needs_review = overall_confidence < MODEL_CONFIG["gpt4o_mini"]["confidence_threshold"]
        if needs_review:
            await self.human_review_queue.put({
                "request_id": request_id,
                "joke": joke,
                "confidence": overall_confidence,
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat()
            })

        # Step 5: Log feedback opportunity (for retraining)
        await self.redis.setex(
            f"feedback:{request_id}", 604800,
            json.dumps({"prompt": prompt, "joke": joke, "user_id": user_id})
        )

        return JokeResponse(
            joke=joke,
            model_used="GPT-4o mini with BERT classifier",
            confidence=overall_confidence,
            needs_human_review=needs_review,
            request_id=request_id
        )

    async def submit_feedback(self, feedback: FeedbackRequest):
        """Submit user feedback for retraining pipeline."""
        await self.feedback_queue.put({
            "request_id": feedback.request_id,
            "joke": feedback.joke,
            "user_rating": feedback.user_rating,
            "was_dark": feedback.was_dark,
            "adversarial_example": feedback.adversarial_example,
            "timestamp": datetime.utcnow().isoformat()
        })
        logging.info(f"Feedback queued for request {feedback.request_id}")

# --- Background Tasks for Retraining & Human Review ---
async def feedback_processor(service: DarkJokeService):
    """Process feedback queue and prepare data for retraining."""
    while True:
        try:
            feedback = await service.feedback_queue.get()
            # In production, write to a data lake or append to a training dataset
            logging.info(f"Processing feedback: {feedback}")
            # Simulate storing for nightly batch job
            with open("/data/feedback_log.jsonl", "a") as f:
                f.write(json.dumps(feedback) + "\n")
            service.feedback_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logging.error(f"Error processing feedback: {e}")

async def human_review_processor(service: DarkJokeService):
    """Process jokes needing human review."""
    while True:
        try:
            review_item = await service.human_review_queue.get()
            # In production, integrate with a human review platform (e.g., Labelbox, Scale AI)
            logging.info(f"Joke needs human review: {review_item}")
            # For now, just log; a human would label and push back to feedback queue
            service.human_review_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logging.error(f"Error in human review processor: {e}")

# --- Adversarial Training Utilities (Conceptual) ---
def adversarial_augmentation(training_data: List[Dict]) -> List[Dict]:
    """Apply adversarial text perturbations to improve model robustness."""
    augmented = []
    for item in training_data:
        text = item["text"]
        # Example simple perturbation: synonym replacement (use NLPAug or TextAttack in production)
        perturbed = text.replace("dark", "morbid").replace("joke", "quip")
        augmented.append({"text": perturbed, "label": item["label"]})
    return training_data

def schedule_retraining():
    """Nightly batch retraining job with adversarial augmentation."""
    # Placeholder: Load feedback data, augment, retrain BERT & GPT models
    # Export optimized models (e.g., to ONNX), then deploy to Triton model repository
    logging.info("Starting nightly retraining job with adversarial augmentation.")
    # In production, use Kubeflow Pipelines, Airflow, or similar for orchestration

# --- FastAPI App Lifespan & Routes ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    service = DarkJokeService()
    app.state.service = service
    # Start background processors
    feedback_task = asyncio.create_task(feedback_processor(service))
    review_task = asyncio.create_task(human_review_processor(service))
    yield
    # Shutdown
    feedback_task.cancel()
    review_task.cancel()
    await service.redis.close()

app = FastAPI(title="Dark Joke API", lifespan=lifespan)

@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    latency = time.time() - start_time
    REQUEST_LATENCY.labels(endpoint=request.url.path).observe(latency)
    REQUESTS_TOTAL.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    return response

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/api/v1/joke", response_model=JokeResponse)
async def generate_dark_joke(
    request: JokeRequest,
    user_id: str = Depends(verify_token)
):
    # Rate limiting
    if await app.state.service.rate_limiter.is_rate_limited(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # Process request
    try:
        result = await app.state.service.process_request(request.prompt, user_id)
        return result
    except Exception as e:
        logging.error(f"Joke generation failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/v1/feedback")
async def submit_feedback(
    feedback: FeedbackRequest,
    user_id: str = Depends(verify_token)
):
    await app.state.service.submit_feedback(feedback)
    return {"status": "feedback accepted"}

# --- Deployment & Scaling Notes (as comments) ---
# 1. Triton Inference Server deployed via Kubernetes with Horizontal Pod Autoscaler (HPA)
#    based on GPU memory usage and request latency.
# 2. Models are stored in a shared volume (e.g., AWS EFS, GCP Filestore) for Triton model repository.
# 3. API service is stateless, scaled horizontally behind a load balancer.
# 4. Redis cluster for distributed rate limiting and caching.
# 5. Nightly retraining pipeline triggers via Kubernetes CronJob, outputs models to shared storage.
# 6. Security: TLS termination at load balancer, JWT tokens issued by separate auth service.
# 7. Monitoring: Prometheus/Grafana dashboards for metrics, distributed tracing with Jaeger.

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=False
    )