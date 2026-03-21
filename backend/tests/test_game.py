import pytest
from game import GameEngine, ANIMALS

def test_add_player():
    engine = GameEngine()
    assert engine.add_player("p1", "Alice") == True
    assert engine.add_player("p1", "Alice2") == False # Duplicate ID
    assert len(engine.state.players) == 1
    
    for i in range(2, 6):
        engine.add_player(f"p{i}", f"Player {i}")
        
    assert len(engine.state.players) == 5
    assert engine.add_player("p6", "Too Many") == False # Max 5 players

def test_start_game_and_deal():
    engine = GameEngine()
    engine.add_player("p1", "Alice")
    assert engine.start_game() == False # Need at least 2 players
    
    engine.add_player("p2", "Bob")
    engine.add_player("p3", "Charlie")
    
    assert engine.start_game() == True
    assert engine.state.status == "playing"
    assert engine.state.round_number == 1
    assert engine.state.total_rounds == 3
    
    # Check deck distribution
    # 30 cards total / 3 players = 10 cards each
    for p in engine.state.players:
        assert len(p.hand) == 10
        
def test_play_card_and_take_token():
    engine = GameEngine()
    engine.add_player("p1", "Alice")
    engine.add_player("p2", "Bob")
    engine.start_game()
    
    # Determine current player
    curr_idx = engine.state.current_player_idx
    curr_player = engine.state.players[curr_idx]
    
    # Try invalid actions
    assert engine.take_token(curr_player.id, "Lion") == False # Must play card first
    assert engine.play_card("wrong_id", 0) == False # Wrong player
    assert engine.play_card(curr_player.id, 99) == False # Invalid card index
    
    # Valid play card
    card_to_play = curr_player.hand[0]
    animal = card_to_play.animal
    assert engine.play_card(curr_player.id, 0) == True
    assert len(curr_player.hand) == 14 # 30/2 = 15 starting cards, played 1
    assert engine.state.turn_stage == "take_token"
    assert len(engine.state.stacks[animal]) == 1
    
    # Valid take token
    assert engine.take_token(curr_player.id, "Zebra") == True
    assert engine.state.tokens_pool["Zebra"] == 4
    assert curr_player.tokens["Zebra"] == 1
    
    # Turn advanced
    assert engine.state.current_player_idx != curr_idx
    assert engine.state.turn_stage == "play_card"

def test_end_round_and_scoring():
    engine = GameEngine()
    engine.add_player("p1", "Alice")
    engine.add_player("p2", "Bob")
    engine.start_game()
    
    from game import Card
    # Manually manipulate state to test scoring
    engine.state.stacks["Lion"] = [Card(animal="Lion", value=4)] # value 4
    engine.state.stacks["Zebra"] = [Card(animal="Zebra", value=0)] # value 0
    engine.state.stacks["Rhino"] = [] # no cards -> 0
    
    engine.state.players[0].tokens["Lion"] = 2  # 2 * 4 = 8
    engine.state.players[0].tokens["Zebra"] = 1 # 1 * 0 = 0
    engine.state.players[0].tokens["Rhino"] = 1 # 1 * 0 = 0
    
    engine.state.players[1].tokens["Lion"] = 1  # 1 * 4 = 4
    
    engine.end_round()
    
    assert engine.state.status == "round_over"
    assert engine.state.players[0].score == 8
    assert engine.state.players[1].score == 4

def test_game_over():
    engine = GameEngine()
    engine.add_player("p1", "Alice")
    engine.add_player("p2", "Bob")
    engine.start_game()
    
    assert engine.state.total_rounds == 2
    
    engine.end_round()
    assert engine.next_round() == True
    assert engine.state.round_number == 2
    assert engine.state.status == "playing"
    
    engine.end_round()
    assert engine.next_round() == True
    assert engine.state.status == "game_over"
