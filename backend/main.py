import asyncio
import json
import uuid
import os
import random
import traceback
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import Dict, Any, List
from pydantic import BaseModel

try:
    from game import GameState, COMPANIES
    from bot_heuristics import get_best_expansion_move, get_best_trade
except ImportError:
    from backend.game import GameState, COMPANIES
    from backend.bot_heuristics import get_best_expansion_move, get_best_trade

app = FastAPI()

# In-memory store
rooms: Dict[str, GameState] = {}
connections: Dict[str, List[WebSocket]] = {}
# Lock for bot execution to prevent double-spawning tasks
bot_locks: Dict[str, bool] = {}

class JoinRequest(BaseModel):
    room_id: str
    player_id: str
    player_name: str

class CreateRoomRequest(BaseModel):
    variants: List[str] = []

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
        bot_locks[room_id] = False
        
    game = rooms[room_id]
    game.add_player(req.player_id, req.player_name)
    return {"status": "ok", "room_id": room_id, "player_id": req.player_id}

@app.post("/api/rooms/{room_id}/add_bot")
async def add_bot(room_id: str):
    room_id = room_id.upper()
    if room_id not in rooms:
        return {"error": "Room not found"}
        
    game = rooms[room_id]
    if game.is_playing:
        return {"error": "Game already started"}
        
    bot_id = "BOT-" + str(uuid.uuid4())[:4].upper()
    bot_names = ["SharkyBot", "FinGPT", "AlphaShark", "DeepBlue"]
    existing_names = [p.name for p in game.players]
    available_names = [n for n in bot_names if n not in existing_names]
    name = random.choice(available_names) if available_names else "Bot_" + bot_id[-4:]
    
    game.add_player(bot_id, name, is_bot=True)
    await broadcast_state(room_id)
    return {"status": "ok", "bot_id": bot_id}

@app.post("/api/rooms/create")
async def create_room(req: CreateRoomRequest):
    room_id = str(uuid.uuid4())[:6].upper()
    rooms[room_id] = GameState(room_id, variants=req.variants)
    connections[room_id] = []
    bot_locks[room_id] = False
    return {"room_id": room_id, "variants": req.variants}

async def broadcast_state(room_id: str):
    if room_id not in connections or room_id not in rooms:
        return
        
    game = rooms[room_id]
    disconnected = []
    
    for ws in connections[room_id]:
        try:
            state = game.get_client_state("")
            state["variants"] = game.variants
            await ws.send_json({"type": "state", "state": state})
        except Exception as e:
            disconnected.append(ws)
            
    for ws in disconnected:
        connections[room_id].remove(ws)

async def run_bot_turn(room_id: str):
    if bot_locks.get(room_id, False):
        return # Prevent duplicate bot loops
        
    bot_locks[room_id] = True
    try:
        if room_id not in rooms: return
        game = rooms[room_id]
        
        player = game.current_player()
        if not player or getattr(player, 'is_bot', False) == False or not game.is_playing:
            return
            
        await asyncio.sleep(1.0)
        
        # In case human ended turn super fast while task queued
        player = game.current_player()
        if not getattr(player, 'is_bot', False):
            return

        if game.phase == "trade1":
            action, comp, count = get_best_trade(game, player)
            if action:
                game.trade(player.id, action, comp, count)
                await broadcast_state(room_id)
                await asyncio.sleep(1.0)
                
            game.roll_dice()
            await broadcast_state(room_id)
            await asyncio.sleep(2.0)
            
        if game.phase == "expand":
            r, c, comp = get_best_expansion_move(game, player, game.current_company_die, game.current_area_die)
            if r != -1 and c != -1:
                game.expand(player.id, r, c, comp, "choose" if comp in COMPANIES else "place")
            else:
                game.phase = "trade2"
                
            await broadcast_state(room_id)
            await asyncio.sleep(1.0)
            
        if game.phase == "trade2":
            action, comp, count = get_best_trade(game, player)
            if action:
                game.trade(player.id, action, comp, count)
                await broadcast_state(room_id)
                await asyncio.sleep(1.0)
                
            success, _ = game.end_turn(player.id)
            if success:
                await broadcast_state(room_id)
                
                next_p = game.current_player()
                if next_p and getattr(next_p, 'is_bot', False) and game.is_playing:
                    # Release lock so the scheduled task can run
                    bot_locks[room_id] = False
                    await asyncio.sleep(0.5)
                    asyncio.create_task(run_bot_turn(room_id))
    except Exception as e:
        print(f"[{room_id}] CRITICAL BOT ERROR:")
        traceback.print_exc()
    finally:
        bot_locks[room_id] = False

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
                
                # Verify that actions are only taken by the current player
                # (Prevents race conditions where an old click triggers during bot turns)
                if action != "start" and player_id != game.current_player().id:
                    continue
                    
                success, error = False, ""
                
                if action == "start":
                    success = game.start_game()
                    if not success: 
                        error = "Need more players"
                    else:
                        p = game.current_player()
                        if p and getattr(p, 'is_bot', False):
                            asyncio.create_task(run_bot_turn(room_id))
                            
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
                        payload.get("company"),
                        payload.get("gray_action", "place")
                    )
                elif action == "end_turn":
                    success, error = game.end_turn(player_id)
                    if success:
                        next_p = game.current_player()
                        if next_p and getattr(next_p, 'is_bot', False) and game.is_playing:
                            asyncio.create_task(run_bot_turn(room_id))
                    
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
elif os.path.exists("dist"):
    # Fallback to current working directory 'dist'
    app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")
elif os.path.exists("/app/dist"):
    # Inside Docker
    app.mount("/", StaticFiles(directory="/app/dist", html=True), name="frontend")
