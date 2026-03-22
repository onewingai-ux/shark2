import random
from typing import List, Tuple, Dict, Any

def get_best_expansion_move(game: Any, player: Any, company_die: str, area_die: str) -> Tuple[int, int, str]:
    """
    Returns the best (row, col, chosen_company) for a bot to expand.
    Heuristics are now portfolio-aware:
    1. Highest priority: Take over a company I don't own much of, using a company I DO own a lot of.
    2. Extend a chain of a company I own stock in.
    3. Create a lone building for a company I own stock in (or just to get $1000 cash).
    """
    try:
        companies_to_try = [company_die]
        
        if company_die in ["black", "gray"]:
            companies_to_try = [c for c in ["red", "blue", "green", "yellow"] if game.remaining_buildings[c] > 0]
            if not companies_to_try:
                return -1, -1, company_die
            
        best_move = None
        best_score = -1000
        dramatic_action = ""

        for comp in companies_to_try:
            if game.remaining_buildings.get(comp, 0) <= 0: continue

            # How much do I care about this company succeeding?
            my_shares = player.stocks.get(comp, 0)
            comp_affinity = my_shares * 10  # Base affinity

            for r in range(12):
                for c in range(12):
                    cell = game.board[r][c]
                    if cell.company is not None: continue
                    
                    if area_die == "SHARK" and cell.area != "SHARK": continue
                    if area_die != "SHARK" and cell.area != area_die: continue

                    score = comp_affinity
                    adj_cells = game._get_adjacent(r, c, include_diagonal=False)
                    
                    is_adj_same = False
                    opposing_chains = []
                    
                    for adj in adj_cells:
                        if adj.company == comp:
                            is_adj_same = True
                        elif adj.company and adj.company != comp and adj.company != "gray":
                            opp_chain = game._get_chain(adj.row, adj.col)
                            if opp_chain not in opposing_chains:
                                opposing_chains.append(opp_chain)

                    is_takeover = len(opposing_chains) > 0
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

                    if is_takeover and valid_takeover:
                        # How much do I want to hurt the opposing companies?
                        opp_affinity = sum(player.stocks.get(chain[0].company, 0) for chain in opposing_chains)
                        # Score = Base takeover value + my affinity for winner - my affinity for loser
                        score += 100 - (opp_affinity * 15)
                        
                        if score > best_score:
                            best_score = score
                            best_move = (r, c, comp)
                            if opp_affinity > 0:
                                dramatic_action = f"😬 {player.name} ruthlessly cannibalizes their own investments in a hostile takeover!"
                            else:
                                dramatic_action = random.choice([
                                    f"🚨 {player.name} launches a devastating hostile takeover for {comp}!",
                                    f"💥 {player.name} aggressively crushes the competition in area {area_die}!"
                                ])
                                
                    elif is_adj_same and not is_takeover:
                        score += 50  # Priority: Extend chain
                        if score > best_score:
                            best_score = score
                            best_move = (r, c, comp)
                            dramatic_action = f"📈 {player.name} strategically expands the {comp} empire."
                            
                    elif not is_adj_same and not is_takeover:
                        score += 10  # Fallback: Lone building ($1000)
                        # If I am broke, lone buildings are great for the instant $1000
                        if player.cash < 2000:
                            score += 40
                            
                        if score > best_score:
                            best_score = score
                            best_move = (r, c, comp)
                            dramatic_action = f"🏗️ {player.name} establishes a new beachhead for {comp}."

        if best_move and dramatic_action:
            game.log(dramatic_action)
            return best_move
            
        if not best_move:
            for comp in companies_to_try:
                for r in range(12):
                    for c in range(12):
                        cell = game.board[r][c]
                        if cell.company is None and (area_die == "SHARK" and cell.area == "SHARK" or area_die != "SHARK" and cell.area == area_die):
                            success, _ = game.expand(player.id, r, c, comp)
                            if success:
                                game.log(f"🤷 {player.name} found no strategic options and made a mediocre placement.")
                                return r, c, comp
                                
        return (-1, -1, company_die)
    except Exception as e:
        print(f"ERROR IN HEURISTICS: {e}")
        return (-1, -1, company_die)

def get_best_trade(game: Any, player: Any) -> Tuple[str, str, int]:
    """
    Returns (action, company, count) or None.
    Smarter Heuristics:
    1. Don't blindly buy $0 stocks unless we're about to build them.
    2. Try to buy stocks of companies that have buildings on the board (momentum).
    3. Diversify (don't buy > 10 of one stock unless it's doing incredibly well).
    4. Sell stocks if they're high and we need cash for other things, or if we're broke.
    5. Don't buy enough stock to end the game UNLESS we are currently mathematically winning.
    6. Defensively SELL stock of a company that is dangerously close to running out in the bank if we are losing, to artificially extend the game.
    """
    try:
        my_wealth = player.cash + sum(player.stocks[c] * game.stock_price[c] for c in ["red", "blue", "green", "yellow"])
        max_opp_wealth = 0
        for p in game.players:
            if p.id != player.id and not getattr(p, "bankrupt", False):
                opp_w = p.cash + sum(p.stocks[c] * game.stock_price[c] for c in ["red", "blue", "green", "yellow"])
                max_opp_wealth = max(max_opp_wealth, opp_w)
                
        i_am_winning = my_wealth >= max_opp_wealth

        momentum = {c: 18 - game.remaining_buildings[c] for c in ["red", "blue", "green", "yellow"]}
        
        # DEFENSIVE SELLING LOGIC (To prevent other players from ending the game)
        if not i_am_winning:
            for c in ["red", "blue", "green", "yellow"]:
                avail_shares = game.total_stocks[c] - sum(p.stocks[c] for p in game.players)
                # If there are only 1 or 2 shares left in the bank, the next player might just buy them and win.
                # Sell 2 shares (or as many as we have) to flood the market and buy time!
                if avail_shares <= 2 and player.stocks[c] > 0 and game.stock_price[c] >= 1000:
                    sell_count = min(2, player.stocks[c])
                    game.log(f"🛡️ {player.name} aggressively shorts {c} to flood the market and prevent an early buyout!")
                    return "sell", c, sell_count

        # REGULAR BUYING LOGIC
        if player.cash >= 1500:
            buy_candidates = []
            for c in ["red", "blue", "green", "yellow"]:
                price = game.stock_price[c]
                my_shares = player.stocks[c]
                avail_shares = game.total_stocks[c] - sum(p.stocks[c] for p in game.players)
                
                if price >= 1000 and avail_shares > 0:
                    if my_shares > 12 and price < 5000:
                        continue
                        
                    # Calculate a "desirability" score:
                    score = momentum[c] * 500 - price
                    buy_candidates.append((score, c, price, avail_shares))
            
            if buy_candidates:
                buy_candidates.sort(key=lambda x: x[0], reverse=True)
                
                for score, target_comp, price, avail_shares in buy_candidates:
                    affordable_count = player.cash // price
                    # To not rush the game, cap purchases per turn to 3 (leaves cash for next turns)
                    count = min(3, affordable_count, avail_shares, max(0, 5 - getattr(game, 'current_turn_purchases', 0)))
                    
                    if count > 0:
                        # CRITICAL FIX: If this purchase empties the bank, the game ends immediately.
                        # Should we do it? Only if we are winning!
                        if avail_shares - count == 0 and not i_am_winning:
                            # We are losing. Empting the bank ends the game and seals our loss.
                            # Adjust count down to keep at least 1 share in the bank to buy more time.
                            count = avail_shares - 1
                            if count <= 0:
                                continue # Skip this company, try the next candidate
                            game.log(f"🛑 {player.name} strategically avoids buying the final {target_comp} shares to keep the game alive!")
                            
                        drama = [
                            f"💰 {player.name} aggressively accumulates {count} shares of {target_comp}!",
                            f"💹 {player.name} sees momentum in {target_comp} and buys {count} shares."
                        ]
                        game.log(random.choice(drama))
                        return "buy", target_comp, count
                    
        # REGULAR SELLING LOGIC
        if player.cash < 2000:
            owned = [(c, game.stock_price[c]) for c in ["red", "blue", "green", "yellow"] 
                     if player.stocks[c] > 0 and game.stock_price[c] >= 1000]
            if owned:
                owned.sort(key=lambda x: x[1], reverse=True)
                target_comp, price = owned[0]
                
                game.log(f"📉 {player.name} liquidates 1 share of {target_comp} to free up capital.")
                return "sell", target_comp, 1
                
        else:
            owned_high = [(c, game.stock_price[c]) for c in ["red", "blue", "green", "yellow"] 
                     if player.stocks[c] >= 5 and game.stock_price[c] >= 8000]
            if owned_high and random.random() > 0.7:
                target_comp, price = owned_high[0]
                game.log(f"🤑 {player.name} takes profits on {target_comp}, selling 2 shares at high valuation.")
                return "sell", target_comp, min(2, player.stocks[target_comp])
                
        return None, None, 0
    except Exception as e:
        print(f"TRADE ERROR: {e}")
        return None, None, 0
