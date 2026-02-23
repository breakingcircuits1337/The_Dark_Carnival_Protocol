import { Router } from 'itty-router';
import { verifyToken } from './auth'; // Custom module to verify OAuth2/JWT tokens
import * as tf from '@tensorflow/tfjs-node';
import { loadModel } from './model'; // Custom function to load the pretrained TF.js model
import { RateLimiter } from './rateLimiter'; // Custom rate limiter implementation

const router = Router();

// Load the TensorFlow.js model on Worker startup
let model;
loadModel('/path/to/model').then(loadedModel => {
  model = loadedModel;
});

// Rate limiter configuration
const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000 // 1 minute
});

// API key validation
const validateApiKey = (req) => {
  const apiKey = req.headers.get('Authorization');
  return apiKey === 'Bearer your-secure-api-key';
};

// Cloudflare Worker handler
async function handleRequest(request) {
  const url = new URL(request.url);

  // Basic security headers
  const securityHeaders = {
    'Content-Security-Policy': "default-src 'none';",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  };

  // Rate limiting
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!rateLimiter.allowRequest(clientIp)) {
    return new Response('Too many requests', {
      status: 429,
      headers: { ...securityHeaders },
    });
  }

  // Route requests
  return router.handle(request, { securityHeaders });
}

// Secure API endpoint
router.post('/api/sentiment', async (request, env, ctx) => {
  const securityHeaders = ctx.securityHeaders;

  try {
    // Verify API key
    if (!validateApiKey(request)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { ...securityHeaders },
      });
    }

    // Verify OAuth2/JWT token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader && authHeader.split(' ')[1];
    const user = await verifyToken(token);
    if (!user) {
      return new Response('Forbidden', {
        status: 403,
        headers: { ...securityHeaders },
      });
    }

    // Parse user input
    const body = await request.json();
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return new Response('Bad Request: Invalid input', {
        status: 400,
        headers: { ...securityHeaders },
      });
    }

    // Run sentiment analysis using TF.js model
    const inputTensor = tf.tensor([text]);
    const prediction = model.predict(inputTensor);
    const sentimentScore = prediction.dataSync()[0];

    // Return sentiment score
    return new Response(JSON.stringify({ sentimentScore }), {
      status: 200,
      headers: {
        ...securityHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...securityHeaders },
    });
  }
});

// Monitoring and logging
addEventListener('fetch', (event) => {
  const startTime = Date.now();
  event.respondWith(
    handleRequest(event.request).then((response) => {
      const duration = Date.now() - startTime;
      console.log(`Request handled in ${duration}ms`);
      return response;
    })
  );
});