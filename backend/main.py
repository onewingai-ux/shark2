from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import json
import uuid
import asyncio

from game import GameEngine, ANIMALS

app = FastAPI()

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Maps room_id to list of active websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Maps room_id to GameEngine
        self.games: Dict[str, GameEngine] = {}
        # Maps websocket to (room_id, player_id)
        self.client_info: Dict[WebSocket, tuple[str, str]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_id: str, player_name: str):
        await websocket.accept()
        
        if room_id not in self.games:
            self.games[room_id] = GameEngine()
            self.active_connections[room_id] = []
            
        game = self.games[room_id]
        
        # Add player if not exists, or update connection status
        player = game.get_player(player_id)
        if not player:
            success = game.add_player(player_id, player_name)
            if not success:
                await websocket.send_json({"type": "error", "message": "Cannot join room."})
                await websocket.close()
                return
        else:
            player.connected = True
            player.name = player_name # Update name if changed
            
        self.active_connections[room_id].append(websocket)
        self.client_info[websocket] = (room_id, player_id)
        
        await self.broadcast_game_state(room_id)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.client_info:
            room_id, player_id = self.client_info[websocket]
            if room_id in self.active_connections:
                if websocket in self.active_connections[room_id]:
                    self.active_connections[room_id].remove(websocket)
            
            game = self.games.get(room_id)
            if game:
                player = game.get_player(player_id)
                if player:
                    player.connected = False
            
            del self.client_info[websocket]
            return room_id
        return None

    async def broadcast_game_state(self, room_id: str):
        if room_id not in self.active_connections or room_id not in self.games:
            return
            
        game = self.games[room_id]
        websockets_to_remove = []
        
        for websocket in self.active_connections[room_id]:
            if websocket in self.client_info:
                _, player_id = self.client_info[websocket]
                state = game.get_public_state(player_id)
                try:
                    await websocket.send_json({"type": "game_state", "state": state})
                except Exception:
                    websockets_to_remove.append(websocket)
                    
        for ws in websockets_to_remove:
            self.disconnect(ws)

manager = ConnectionManager()

@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str, name: str = "Player"):
    await manager.connect(websocket, room_id, player_id, name)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            game = manager.games.get(room_id)
            if not game:
                continue
                
            action = message.get("action")
            
            if action == "start_game":
                game.start_game()
                await manager.broadcast_game_state(room_id)
                
            elif action == "play_card":
                card_index = message.get("card_index")
                if card_index is not None:
                    success = game.play_card(player_id, card_index)
                    if success:
                        await manager.broadcast_game_state(room_id)
                    else:
                        await websocket.send_json({"type": "error", "message": "Invalid move: play_card"})
                        
            elif action == "take_token":
                animal = message.get("animal")
                if animal in ANIMALS:
                    success = game.take_token(player_id, animal)
                    if success:
                        await manager.broadcast_game_state(room_id)
                    else:
                        await websocket.send_json({"type": "error", "message": "Invalid move: take_token"})
                        
            elif action == "next_round":
                # Ensure only starting player or any player can trigger next round? Let's allow any for simplicity.
                success = game.next_round()
                if success:
                    await manager.broadcast_game_state(room_id)
                else:
                    await websocket.send_json({"type": "error", "message": "Cannot start next round"})
                    
    except WebSocketDisconnect:
        room_id = manager.disconnect(websocket)
        if room_id:
            await manager.broadcast_game_state(room_id)
    except Exception as e:
        print(f"Error: {e}")
        room_id = manager.disconnect(websocket)
        if room_id:
            await manager.broadcast_game_state(room_id)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
