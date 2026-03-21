import asyncio
import json
import uuid
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import Dict, Any, List
from pydantic import BaseModel

from game import GameState, COMPANIES

app = FastAPI()

# In-memory store
rooms: Dict[str, GameState] = {}
connections: Dict[str, List[WebSocket]] = {}

class JoinRequest(BaseModel):
    room_id: str
    player_id: str
    player_name: str

class ActionRequest(BaseModel):
    room_id: str
    player_id: str
    action: str
    data: Dict[str, Any]

@app.post("/api/rooms/{room_id}/join")
async def join_room(room_id: str, req: JoinRequest):
    room_id = room_id.upper()
    if room_id not in rooms:
        rooms[room_id] = GameState(room_id)
        connections[room_id] = []
        
    game = rooms[room_id]
    game.add_player(req.player_id, req.player_name)
    return {"status": "ok", "room_id": room_id, "player_id": req.player_id}

@app.post("/api/rooms/create")
async def create_room():
    room_id = str(uuid.uuid4())[:6].upper()
    rooms[room_id] = GameState(room_id)
    connections[room_id] = []
    return {"room_id": room_id}

async def broadcast_state(room_id: str):
    if room_id not in connections or room_id not in rooms:
        return
        
    game = rooms[room_id]
    disconnected = []
    
    for ws in connections[room_id]:
        try:
            state = game.get_client_state("")
            await ws.send_json({"type": "state", "state": state})
        except Exception as e:
            disconnected.append(ws)
            
    for ws in disconnected:
        connections[room_id].remove(ws)

@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()
    room_id = room_id.upper()
    
    if room_id not in connections:
        connections[room_id] = []
    connections[room_id].append(websocket)
    
    if room_id in rooms:
        await broadcast_state(room_id)
        
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            if msg.get("type") == "action":
                action = msg.get("action")
                payload = msg.get("data", {})
                
                if room_id not in rooms:
                    continue
                    
                game = rooms[room_id]
                success, error = False, ""
                
                if action == "start":
                    success = game.start_game()
                    if not success: error = "Need more players"
                elif action == "roll":
                    game.roll_dice()
                    success = True
                elif action == "trade":
                    success, error = game.trade(
                        player_id,
                        payload.get("trade_type"),
                        payload.get("company"),
                        payload.get("count", 1)
                    )
                elif action == "expand":
                    success, error = game.expand(
                        player_id,
                        payload.get("row"),
                        payload.get("col"),
                        payload.get("company")
                    )
                elif action == "end_turn":
                    success, error = game.end_turn(player_id)
                    
                if error:
                    await websocket.send_json({"type": "error", "message": error})
                    
                await broadcast_state(room_id)
                
    except WebSocketDisconnect:
        if room_id in connections and websocket in connections[room_id]:
            connections[room_id].remove(websocket)

# Try locating the dist folder correctly whether running locally or in Docker
dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")

if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
else:
    # Fallback to current working directory 'dist'
    app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")
