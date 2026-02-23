import asyncio
import json
import httpx
import os
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import logging
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

app = FastAPI(title="Self-R Ringmaster")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store of connected sub-swarm nodes
active_nodes: Dict[str, Dict[str, Any]] = {}

# Active UI WebSocket connections (The Hub)
ui_connections: List[WebSocket] = []

def redraw_cli():
    os.system('cls' if os.name == 'nt' else 'clear')
    wagons = len(active_nodes)
    agents = wagons * 3
    banner = rf"""
       _____            _____  _  __
      |  __ \    /\    |  __ \| |/ /
      | |  | |  /  \   | |__) | ' / 
      | |  | | / /\ \  |  _  /|  <  
      | |__| |/ ____ \ | | \ \| . \ 
      |_____//_/    \_\|_|  \_\_|\_\ 

   _____          _____  _   _ _______      __     _      
  / ____|   /\   |  __ \| \ | |_   _\ \    / /\   | |     
 | |       /  \  | |__) |  \| | | |  \ \  / /  \  | |     
 | |      / /\ \ |  _  /| . ` | | |   \ \/ / /\ \ | |     
 | |____ / ____ \| | \ \| |\  |_| |_   \  / ____ \| |____ 
  \_____/_/    \_\_|  \_\_| \_|_____|   \/_/    \_\______|

               T H E   P R O T O C O L   V 1 . 0
------------------------------------------------------------
[+] The Ringmaster: ONLINE
[+] Swarm Status: {wagons} Wagons Connected ({agents} Agents Active)
[+] Current Mode: ADVERSARIAL DEBATE (JECKEL & HYDE)
------------------------------------------------------------
"""
    sys.stdout.write(banner)
    sys.stdout.flush()

class NodeRegistration(BaseModel):
    id: str
    ip: str
    port: int
    role: str

class SwarmTaskPayload(BaseModel):
    objective: str
    target_node_id: Optional[str] = None # Optional: direct to specific node
    role_target: Optional[str] = None    # Optional: direct to any node with this role
    visionary: str = "Kimi"
    critic: str = "Mistral"
    tactician: str = "DeepSeek"

@app.post("/api/nodes/register")
async def register_node(node: NodeRegistration):
    """Sub-nodes call this on boot to announce themselves to the Ringmaster."""
    node_id = node.id
    if node_id not in active_nodes:
        active_nodes[node_id] = {
            "id": node.id,
            "url": f"http://{node.ip}:{node.port}",
            "role": node.role,
            "status": "IDLE",
            "last_ping": 123456789 # Placeholder for actual time later
        }
    else:
        active_nodes[node_id]["url"] = f"http://{node.ip}:{node.port}"
        active_nodes[node_id]["role"] = node.role
        active_nodes[node_id]["last_ping"] = 123456789
    await broadcast_to_ui({"type": "node_update", "nodes": list(active_nodes.values())})
    redraw_cli()
    return {"status": "registered", "node_id": node_id}

@app.post("/api/swarm/dispatch")
async def dispatch_swarm(payload: SwarmTaskPayload):
    """UI uses this to dispatch an objective to the swarm."""
    objective = payload.objective
    
    # Simple routing logic
    target_url = None
    target_id = None
    
    if payload.target_node_id and payload.target_node_id in active_nodes:
        target_id = payload.target_node_id
        target_url = active_nodes[target_id]["url"]
    elif payload.role_target:
        # Find first node with matching role
        for nid, ninfo in active_nodes.items():
            if ninfo["role"].upper() == payload.role_target.upper() and ninfo["status"] == "IDLE":
                target_id = nid
                target_url = ninfo["url"]
                break
    
    # Fallback to any IDLE node
    if not target_url:
        for nid, ninfo in active_nodes.items():
            if ninfo["status"] == "IDLE":
                target_id = nid
                target_url = ninfo["url"]
                break
                
    if not target_url:
        return {"error": "No available nodes to process this objective."}
        
    # Update node status
    if target_id in active_nodes:
        active_nodes[target_id]["status"] = "DRAFTING"
        await broadcast_to_ui({"type": "node_update", "nodes": list(active_nodes.values())})
        await broadcast_to_ui({"type": "terminal_log", "node_id": "RINGMASTER", "log": f"> Routed objective to {target_id} ({active_nodes[target_id]['role']})"})

    # Fire API request to the sub-swarm
    async def fire_and_forget():
        async with httpx.AsyncClient(timeout=300.0) as client:
            try:
                # Assuming the sub-node's /api/swarm/execute endpoint exists based on earlier implementation
                req_payload = {
                    "objective": objective,
                    "visionary": payload.visionary,
                    "critic": payload.critic,
                    "tactician": payload.tactician,
                    "auto_approve": False # Set to false so UI can intercept
                }
                res = await client.post(f"{target_url}/api/swarm/execute", json=req_payload)
                if target_id in active_nodes:
                    active_nodes[target_id]["status"] = "AWAITING HUMAN"
                    await broadcast_to_ui({"type": "node_update", "nodes": list(active_nodes.values())})
            except Exception as e:
                print(f"Failed to dispatch to {target_url}: {e}")
                if target_id in active_nodes:
                    active_nodes[target_id]["status"] = "ERROR"
                    await broadcast_to_ui({"type": "node_update", "nodes": list(active_nodes.values())})

    asyncio.create_task(fire_and_forget())
    return {"status": "dispatched", "target": target_id}

# ─── VAULT PROXY ENDPOINTS ──────────────────────────────────────────────────
# These proxy requests to the individual Wagon nodes' /api/completions endpoints

@app.get("/api/vault")
async def vault_aggregate():
    """Fetch completion file lists from ALL connected wagons and aggregate them."""
    result = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for node_id, node in active_nodes.items():
            try:
                res = await client.get(f"{node['url']}/api/completions")
                data = res.json()
                for fname in data.get("files", []):
                    result.append({"node_id": node_id, "url": node["url"], "filename": fname})
            except Exception as e:
                result.append({"node_id": node_id, "url": node["url"], "error": str(e)})
    return {"vault": result}

@app.get("/api/vault/{node_id}")
async def vault_node_files(node_id: str):
    """Fetch completions from a specific Wagon node."""
    if node_id not in active_nodes:
        return {"error": f"Node '{node_id}' not found."}
    url = active_nodes[node_id]["url"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(f"{url}/api/completions")
            return res.json()
        except Exception as e:
            return {"error": str(e)}

@app.delete("/api/vault/{node_id}/{filename}")
async def vault_delete_file(node_id: str, filename: str):
    """Delete a completion file from a specific Wagon node's vault."""
    if node_id not in active_nodes:
        return {"error": f"Node '{node_id}' not found."}
    url = active_nodes[node_id]["url"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.delete(f"{url}/api/completions/{filename}")
            return res.json()
        except Exception as e:
            return {"error": str(e)}

class LearnPayload(BaseModel):
    filename: str
    contents: str

@app.post("/api/vault/{node_id}/learn")
async def vault_learn(node_id: str, payload: LearnPayload):
    """Proxy a completion file to a Wagon node's /api/learn endpoint for LLM ingestion."""
    if node_id not in active_nodes:
        return {"error": f"Node '{node_id}' not found."}
    url = active_nodes[node_id]["url"]
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            res = await client.post(f"{url}/api/learn", json={"filename": payload.filename, "contents": payload.contents})
            return res.json()
        except Exception as e:
            return {"error": str(e)}

app.mount("/", StaticFiles(directory="public", html=True), name="public")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ui_connections.append(websocket)
    
    # Send current state immediately
    await websocket.send_json({"type": "node_update", "nodes": list(active_nodes.values())})
    
    try:
        while True:
            data = await websocket.receive_text()
            # UI can send commands here
            pass
    except WebSocketDisconnect:
        ui_connections.remove(websocket)

async def broadcast_to_ui(message: dict):
    for connection in ui_connections:
        try:
            await connection.send_json(message)
        except:
            pass



@app.on_event("startup")
async def startup_event():
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # A short delay to let uvicorn print its startup lines before we clear the screen
    async def initial_draw():
        await asyncio.sleep(1)
        redraw_cli()
    asyncio.create_task(initial_draw())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
