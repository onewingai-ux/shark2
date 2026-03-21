import random
from typing import List, Tuple, Dict, Any

def get_best_expansion_move(game: Any, player: Any, company_die: str, area_die: str) -> Tuple[int, int, str]:
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
    dramatic_action = ""

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
                    possible_drama = [
                        f"🚨 {player.name} launches a ruthless hostile takeover of the market!",
                        f"💥 {player.name} aggressively crushes the competition in area {area_die}!",
                        f"🦈 {player.name} smells blood and initiates a devastating buyout!"
                    ]
                    current_drama = random.choice(possible_drama)
                elif is_adj_same and not is_takeover:
                    score = 50  # Priority: Extend chain
                    possible_drama = [
                        f"📈 {player.name} strategically expands their corporate empire.",
                        f"🏢 {player.name} builds another skyscraper, driving up stock prices!"
                    ]
                    current_drama = random.choice(possible_drama)
                elif not is_adj_same and not is_takeover:
                    score = 10  # Fallback: Lone building ($1000)
                    current_drama = f"🏗️ {player.name} establishes a new beachhead for {comp}."
                else:
                    continue # Invalid move

                if score > best_score:
                    best_score = score
                    best_move = (r, c, comp)
                    dramatic_action = current_drama
                    
    # Log the drama
    if best_move and dramatic_action:
        game.log(dramatic_action)
        return best_move
        
    # Fallback to mathematically valid spot without heuristics
    if not best_move:
        for comp in companies_to_try:
            for r in range(12):
                for c in range(12):
                    cell = game.board[r][c]
                    if cell.company is None and (area_die == "SHARK" and cell.area == "SHARK" or area_die != "SHARK" and cell.area == area_die):
                        success, _ = game.expand(player.id, r, c, comp)
                        if success:
                            game.log(f"🤷 {player.name} forced to make a mediocre placement.")
                            return r, c, comp
                            
    return (-1, -1, company_die)

def get_best_trade(game: Any, player: Any) -> Tuple[str, str, int]:
    """
    Returns (action, company, count) or None.
    Heuristics:
    1. Buy cheapest stock if cash > $2000
    2. Sell stocks only if cash == 0 (to stay afloat)
    """
    if player.cash >= 2000:
        available = [c for c in ["red", "blue", "green", "yellow"] 
                     if 1000 <= game.stock_price[c] <= player.cash 
                     and sum(p.stocks[c] for p in game.players) < game.total_stocks[c]]
                     
        if available:
            available.sort(key=lambda c: game.stock_price[c])
            target_comp = available[0]
            
            max_can_buy = min(5, player.cash // game.stock_price[target_comp])
            max_avail = game.total_stocks[target_comp] - sum(p.stocks[target_comp] for p in game.players)
            count = min(max_can_buy, max_avail)
            
            if count > 0:
                drama = [
                    f"💰 {player.name} aggressively accumulates {count} shares of {target_comp}!",
                    f"💹 Wall Street takes notice as {player.name} buys up {target_comp} stock."
                ]
                game.log(random.choice(drama))
                return "buy", target_comp, count
                
    elif player.cash < 1000:
        owned = [c for c in ["red", "blue", "green", "yellow"] if player.stocks[c] > 0 and game.stock_price[c] >= 1000]
        if owned:
            owned.sort(key=lambda c: game.stock_price[c], reverse=True)
            game.log(f"📉 Desperate times! {player.name} is forced to liquidate {owned[0]} assets to stay afloat.")
            return "sell", owned[0], 1
            
    return None, None, 0
