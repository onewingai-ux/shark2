import random
from typing import List, Tuple, Dict, Any

def get_best_expansion_move(game: Any, player_id: str, company_die: str, area_die: str) -> Tuple[int, int, str]:
    """
    Returns the best (row, col, chosen_company) for a bot to expand.
    Heuristics in priority order:
    1. Hostile takeover (highest priority)
    2. Extend an existing chain (boosts stock price)
    3. Create a lone building (instant $1000 bonus)
    """
    companies_to_try = [company_die]
    if company_die in ["black", "gray"]:
        companies_to_try = [c for c in ["red", "blue", "green", "yellow"] if game.remaining_buildings[c] > 0]
        
    best_move = None
    best_score = -1

    for comp in companies_to_try:
        if game.remaining_buildings[comp] <= 0: continue

        for r in range(12):
            for c in range(12):
                cell = game.board[r][c]
                if cell.company is not None: continue
                
                # Check area match
                if area_die == "SHARK" and cell.area != "SHARK": continue
                if area_die != "SHARK" and cell.area != area_die: continue

                # Evaluate move score based on adjacency
                score = 0
                adj_cells = game._get_adjacent(r, c, include_diagonal=False)
                
                is_adj_same = False
                opposing_chains = []
                
                for adj in adj_cells:
                    if adj.company == comp:
                        is_adj_same = True
                    elif adj.company and adj.company != comp:
                        opp_chain = game._get_chain(adj.row, adj.col)
                        if opp_chain not in opposing_chains:
                            opposing_chains.append(opp_chain)

                is_takeover = len(opposing_chains) > 0

                # Validate takeover
                valid_takeover = False
                if is_takeover:
                    if is_adj_same:
                        temp_chain_len = 1
                        for adj in adj_cells:
                            if adj.company == comp:
                                temp_chain_len += len(game._get_chain(adj.row, adj.col))
                        
                        valid_takeover = True
                        for opp_chain in opposing_chains:
                            if temp_chain_len <= len(opp_chain):
                                valid_takeover = False
                                break

                # Score the move
                if is_takeover and valid_takeover:
                    score = 100 # Highest priority: Takeover
                elif is_adj_same and not is_takeover:
                    score = 50  # Priority: Extend chain
                elif not is_adj_same and not is_takeover:
                    score = 10  # Fallback: Lone building ($1000)
                else:
                    continue # Invalid move (e.g. invalid takeover attempt)

                if score > best_score:
                    best_score = score
                    best_move = (r, c, comp)
                    
    # If no move with a positive score found (e.g. all spots blocked or invalid takeovers),
    # fallback to just finding the first mathematically valid spot (though heuristics should cover most).
    if not best_move:
        for comp in companies_to_try:
            for r in range(12):
                for c in range(12):
                    cell = game.board[r][c]
                    if cell.company is None and (area_die == "SHARK" and cell.area == "SHARK" or area_die != "SHARK" and cell.area == area_die):
                        success, _ = game.expand(player_id, r, c, comp)
                        if success:
                            return r, c, comp
                            
    return best_move if best_move else (-1, -1, company_die)

def get_best_trade(game: Any, player: Any) -> Tuple[str, str, int]:
    """
    Returns (action, company, count) or None.
    Heuristics:
    1. Buy cheapest stock if cash > $2000
    2. Sell stocks only if cash == 0 (to stay afloat)
    """
    if player.cash >= 2000:
        # Buy cheapest available stock that costs >= 1000
        available = [c for c in ["red", "blue", "green", "yellow"] 
                     if 1000 <= game.stock_price[c] <= player.cash 
                     and sum(p.stocks[c] for p in game.players) < game.total_stocks[c]]
                     
        if available:
            # Sort by price (cheapest first)
            available.sort(key=lambda c: game.stock_price[c])
            target_comp = available[0]
            
            # Buy as many as possible up to 5
            max_can_buy = min(5, player.cash // game.stock_price[target_comp])
            max_avail = game.total_stocks[target_comp] - sum(p.stocks[target_comp] for p in game.players)
            count = min(max_can_buy, max_avail)
            
            if count > 0:
                return "buy", target_comp, count
                
    elif player.cash < 1000:
        # Sell most expensive stock to get cash
        owned = [c for c in ["red", "blue", "green", "yellow"] if player.stocks[c] > 0 and game.stock_price[c] >= 1000]
        if owned:
            owned.sort(key=lambda c: game.stock_price[c], reverse=True)
            return "sell", owned[0], 1
            
    return None, None, 0
