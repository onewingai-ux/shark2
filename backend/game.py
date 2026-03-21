import random
from typing import List, Dict, Tuple, Optional
from pydantic import BaseModel, Field

class Card(BaseModel):
    animal: str
    value: int

class Player(BaseModel):
    id: str
    name: str
    hand: List[Card] = Field(default_factory=list)
    tokens: Dict[str, int] = Field(default_factory=lambda: {"Lion": 0, "Rhino": 0, "Elephant": 0, "Leopard": 0, "Zebra": 0})
    score: int = 0
    connected: bool = True

class GameState(BaseModel):
    status: str = "waiting" # waiting, playing, round_over, game_over
    players: List[Player] = Field(default_factory=list)
    current_player_idx: int = 0
    round_number: int = 1
    total_rounds: int = 1
    
    # Board state
    stacks: Dict[str, List[Card]] = Field(default_factory=lambda: {"Lion": [], "Rhino": [], "Elephant": [], "Leopard": [], "Zebra": []})
    tokens_pool: Dict[str, int] = Field(default_factory=lambda: {"Lion": 5, "Rhino": 5, "Elephant": 5, "Leopard": 5, "Zebra": 5})
    
    # Turn state
    turn_stage: str = "play_card" # play_card, take_token

ANIMALS = ["Lion", "Rhino", "Elephant", "Leopard", "Zebra"]

class GameEngine:
    def __init__(self):
        self.state = GameState()
    
    def add_player(self, player_id: str, name: str) -> bool:
        if self.state.status != "waiting":
            return False
        if len(self.state.players) >= 5:
            return False
        if any(p.id == player_id for p in self.state.players):
            return False
            
        self.state.players.append(Player(id=player_id, name=name))
        return True
        
    def start_game(self) -> bool:
        if self.state.status != "waiting" and self.state.status != "game_over":
            return False
        num_players = len(self.state.players)
        if num_players < 2:
            return False
            
        self.state.total_rounds = num_players
        self.state.round_number = 1
        
        # Reset scores for a new game
        for player in self.state.players:
            player.score = 0
            
        self.start_round()
        self.state.status = "playing"
        return True
        
    def start_round(self):
        # Reset board
        self.state.stacks = {a: [] for a in ANIMALS}
        self.state.tokens_pool = {a: 5 for a in ANIMALS}
        
        # Reset player hands and tokens for the round
        for player in self.state.players:
            player.hand = []
            player.tokens = {a: 0 for a in ANIMALS}
            
        # Create deck
        deck = [Card(animal=a, value=v) for a in ANIMALS for v in range(6)]
        random.shuffle(deck)
        
        # Deal cards evenly
        num_players = len(self.state.players)
        cards_per_player = len(deck) // num_players
        
        for i, player in enumerate(self.state.players):
            start_idx = i * cards_per_player
            player.hand = deck[start_idx : start_idx + cards_per_player]
            
        # Determine starting player (shifts each round)
        self.state.current_player_idx = (self.state.round_number - 1) % num_players
        self.state.turn_stage = "play_card"
        self.state.status = "playing"
        
    def play_card(self, player_id: str, card_index: int) -> bool:
        if self.state.status != "playing" or self.state.turn_stage != "play_card":
            return False
            
        current_player = self.state.players[self.state.current_player_idx]
        if current_player.id != player_id:
            return False
            
        if card_index < 0 or card_index >= len(current_player.hand):
            return False
            
        # Play the card
        card = current_player.hand.pop(card_index)
        self.state.stacks[card.animal].append(card)
        
        # Check if the round ends (6th card played)
        if len(self.state.stacks[card.animal]) == 6:
            self.end_round()
            return True
            
        # Move to take token stage
        self.state.turn_stage = "take_token"
        
        # Auto-skip token taking if pool is empty
        if sum(self.state.tokens_pool.values()) == 0:
            self.end_turn()
            
        return True
        
    def take_token(self, player_id: str, animal: str) -> bool:
        if self.state.status != "playing" or self.state.turn_stage != "take_token":
            return False
            
        current_player = self.state.players[self.state.current_player_idx]
        if current_player.id != player_id:
            return False
            
        if animal not in self.state.tokens_pool or self.state.tokens_pool[animal] <= 0:
            return False
            
        # Take the token
        self.state.tokens_pool[animal] -= 1
        current_player.tokens[animal] += 1
        
        self.end_turn()
        return True
        
    def end_turn(self):
        self.state.current_player_idx = (self.state.current_player_idx + 1) % len(self.state.players)
        self.state.turn_stage = "play_card"
        
        # If the next player has no cards (shouldn't happen before 6th card normally, but just in case)
        # Actually, the round ends when the 6th card is played. So no player will ever run out of cards.
        
    def end_round(self):
        self.state.status = "round_over"
        
        # Calculate scores
        for player in self.state.players:
            round_score = 0
            for animal, count in player.tokens.items():
                if count > 0:
                    stack = self.state.stacks[animal]
                    if stack:
                        value = stack[-1].value
                        round_score += count * value
            player.score += round_score
            
    def next_round(self) -> bool:
        if self.state.status != "round_over":
            return False
            
        if self.state.round_number >= self.state.total_rounds:
            self.state.status = "game_over"
            return True
            
        self.state.round_number += 1
        self.start_round()
        return True

    def get_player(self, player_id: str) -> Optional[Player]:
        for p in self.state.players:
            if p.id == player_id:
                return p
        return None
        
    def get_public_state(self, viewer_id: str) -> dict:
        state_dict = self.state.model_dump()
        
        # Sanitize hands for other players
        for i, player in enumerate(state_dict["players"]):
            if player["id"] != viewer_id:
                # Replace hand with just a list of empty objects or counts
                player["hand"] = [{"animal": "hidden", "value": -1} for _ in range(len(player["hand"]))]
            # Remove sensitive data like connection ID if needed, but here ID is used as simple token
                
        return state_dict
