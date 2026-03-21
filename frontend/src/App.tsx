import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, Play, DollarSign, LogOut, Info, ArrowRightCircle, RefreshCcw, Bot, ArrowUpCircle, ArrowDownCircle, Settings, HelpCircle, X } from "lucide-react";
import "./App.css";

const COMPANIES = ["red", "blue", "green", "yellow"];

function App() {
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameState, setGameState] = useState<any>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [variants, setVariants] = useState<string[]>(["open_hands"]); 

  const [tradeCompany, setTradeCompany] = useState("red");
  const [tradeCount, setTradeCount] = useState(1);
  const [wildcardCompany, setWildcardCompany] = useState("red");
  const [grayAction, setGrayAction] = useState("place");
  
  // Animation tracking
  const [lossAnimations, setLossAnimations] = useState<Record<string, boolean>>({});

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const connectWs = (room: string, player: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/${room}/${player}`;
    const socket = new WebSocket(url);
    
    socket.onopen = () => {
      console.log("Connected to WS");
      setErrorMsg("");
    };
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "state") {
        const newState = data.state;
        
        // Check for loss animations
        if (newState.log_flags && newState.log_flags.length > 0) {
            const newAnimations: Record<string, boolean> = {};
            newState.log_flags.forEach((flag: string) => {
                if (flag.startsWith("LOSS_") || flag.startsWith("BANKRUPT_")) {
                    const id = flag.split("_")[1];
                    newAnimations[id] = true;
                }
            });
            
            if (Object.keys(newAnimations).length > 0) {
                setLossAnimations(newAnimations);
                // Clear animations after 1.5s
                setTimeout(() => setLossAnimations({}), 1500);
            }
        }
        
        setGameState(newState);
        setErrorMsg("");
      } else if (data.type === "error") {
        setErrorMsg(data.message);
        setTimeout(() => setErrorMsg(""), 5000);
      }
    };
    
    socket.onclose = () => {
      console.log("Disconnected from WS");
      setWs(null);
    };
    
    wsRef.current = socket;
    setWs(socket);
  };

  const createRoom = async () => {
    try {
      const res = await fetch("/api/rooms/create", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants }) 
      });
      const data = await res.json();
      setRoomId(data.room_id);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to create room. Ensure backend is running.");
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !playerName) return;
    
    const pid = Math.random().toString(36).substring(2, 9);
    setPlayerId(pid);
    
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, player_id: pid, player_name: playerName })
      });
      
      if (res.ok) {
        connectWs(roomId, pid);
      } else {
        setErrorMsg("Failed to join room. It might not exist.");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to join room.");
    }
  };
  
  const addBot = async () => {
    if (!gameState) return;
    try {
      const res = await fetch(`/api/rooms/${gameState.room_id}/add_bot`, { method: "POST" });
      if (!res.ok) setErrorMsg("Failed to add bot.");
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to add bot.");
    }
  }

  const sendAction = (action: string, data: any = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "action", action, data }));
  };

  const handleCellClick = (r: number, c: number) => {
    if (gameState?.phase !== "expand") return;
    if (gameState?.current_player !== playerId) return;
    
    let comp = gameState.current_company_die;
    if (comp === "black" && !gameState.variants.includes("joker_buildings")) {
      comp = wildcardCompany;
    } else if (comp === "gray" && !gameState.variants.includes("neutral_buildings")) {
      comp = wildcardCompany;
    }
    
    sendAction("expand", { row: r, col: c, company: comp, gray_action: grayAction });
  };
  
  const toggleVariant = (variant: string) => {
    setVariants(prev => prev.includes(variant) ? prev.filter(v => v !== variant) : [...prev, variant]);
  }

  if (!ws) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <h1>SHARK</h1>
          <p>The ruthless game of stocks and hostile takeovers.</p>
          
          {errorMsg && (
            <div className="error-message">
              <AlertCircle size={24} />
              {errorMsg}
            </div>
          )}
          
          <div className="lobby-form">
            <button type="button" onClick={() => setShowHowToPlay(true)} style={{ background: "transparent", color: "var(--primary)", border: "2px solid var(--primary)", marginBottom: "1rem" }}>
              <HelpCircle size={18} /> Read the Rules
            </button>
            
            <div className="variant-selection">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text-muted)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Settings size={16} /> GAME VARIANTS
              </div>
              <label className="variant-label" title="End game when a stock hits $10,000 instead of $15,000">
                <input type="checkbox" checked={variants.includes("short_game")} onChange={() => toggleVariant("short_game")} />
                Short Game (End at $10k)
              </label>
              <label className="variant-label" title="Black die places a wild Joker building">
                <input type="checkbox" checked={variants.includes("joker_buildings")} onChange={() => toggleVariant("joker_buildings")} />
                Joker Buildings (Black Die)
              </label>
              <label className="variant-label" title="Gray die places/removes a blocking Neutral building">
                <input type="checkbox" checked={variants.includes("neutral_buildings")} onChange={() => toggleVariant("neutral_buildings")} />
                Neutral Buildings (Gray Die)
              </label>
              <label className="variant-label" title="Pioneering a new area grants an extra turn">
                <input type="checkbox" checked={variants.includes("pioneer_rule")} onChange={() => toggleVariant("pioneer_rule")} />
                Pioneer Rule
              </label>
              <label className="variant-label" title="See exact stock counts of opponents">
                <input type="checkbox" checked={variants.includes("open_hands")} onChange={() => toggleVariant("open_hands")} />
                Open Hands (Visible Stocks)
              </label>
            </div>
            
            <button type="button" onClick={createRoom} style={{ background: "var(--primary)", color: "#fff", fontSize: "1.1rem", padding: "1rem" }}>
              <Play size={20} /> Create New Game
            </button>
            
            <div className="divider">OR JOIN EXISTING</div>
            
            <form onSubmit={joinRoom} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <input 
                placeholder="Room Code (e.g., A1B2C3)" 
                value={roomId} 
                onChange={e => setRoomId(e.target.value.toUpperCase())} 
                required 
              />
              <input 
                placeholder="Your Name" 
                value={playerName} 
                onChange={e => setPlayerName(e.target.value)} 
                required 
                maxLength={12}
              />
              <button type="submit" style={{ background: "#334155" }}>Join Game</button>
            </form>
          </div>
        </div>
        
        {showHowToPlay && (
          <div className="how-to-play-modal" onClick={() => setShowHowToPlay(false)}>
            <div className="how-to-play-content" onClick={e => e.stopPropagation()}>
              <button className="close-button" onClick={() => setShowHowToPlay(false)}><X size={32} /></button>
              <h2>How to Play Shark 🦈</h2>
              
              <h3>Objective</h3>
              <p>Be the wealthiest player when the game ends. You earn wealth by buying and selling stocks, expanding companies, and triggering hostile takeovers.</p>

              <h3>Turn Structure</h3>
              <ul>
                <li><strong>Trade (Optional):</strong> Buy up to 5 stocks total and/or sell any number. Stocks must be ≥ $1,000 to trade.</li>
                <li><strong>Expand (Mandatory):</strong> Roll the Company and Area dice. Place a building of the rolled company onto an empty cell in the rolled area.</li>
                <li><strong>Trade Again (Optional):</strong> You can buy/sell again, observing the 5-stock buy limit for the whole turn.</li>
              </ul>
              
              <h3>Placing Buildings</h3>
              <ul>
                <li><strong>Lone Building:</strong> Placing a building not orthogonally adjacent to any other buildings grants you a $1,000 bonus.</li>
                <li><strong>Chains:</strong> Placing adjacent to others of the SAME color forms a chain. The stock price becomes $1,000 × (buildings in chain). You get a cash bonus equal to the new stock price!</li>
                <li><strong>Hostile Takeover:</strong> You can place adjacent to an OPPOSING company ONLY IF your newly formed chain is strictly larger than the opposing chain. You destroy the opposing buildings, dropping their stock price!</li>
              </ul>

              <h3>Dividends & Losses</h3>
              <p>Whenever a company's stock price goes UP, everyone holding that stock gets paid the difference in cash. When it goes DOWN (due to a takeover), everyone (except the current player) pays the difference! If you can't pay, you must sell stocks at half price or go bankrupt.</p>

              <h3>Optional Variants</h3>
              <ul>
                <li><strong>Joker (Black Die):</strong> Black buildings are wild, placed as lone buildings. Bonus = highest stock price. Once chained, they adopt that color forever and cannot be removed.</li>
                <li><strong>Neutral (Gray Die):</strong> Grey buildings are barriers blocking expansion. When rolled, choose to place a gray barrier, remove an existing gray barrier, or place any standard company building instead.</li>
                <li><strong>Pioneer Rule:</strong> The first building placed in a new area grants $1000 and an immediate extra turn (max 2 per turn).</li>
                <li><strong>Open Hands:</strong> You can see exactly how many stocks of each color your opponents hold.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!gameState) return <div className="lobby-container"><div className="lobby-card">Loading Game State...</div></div>;

  const isMyTurn = gameState.current_player === playerId;
  const me = gameState.players.find((p: any) => p.id === playerId);

  const getCompanyColorClasses = (company: string) => {
    if (company === "black") return "company-black";
    if (company === "gray") return "company-gray";
    return `company-${company}`;
  };

  return (
    <div className="container">
      <header>
        <h2>🦈 SHARK <span style={{ color: "var(--text-muted)", fontSize: "1rem", fontFamily: "'Space Mono', monospace", fontWeight: 400 }}>Room: {gameState.room_id}</span></h2>
        <div className="player-tag">{playerName}</div>
      </header>

      <div className="main-content">
        <div className="board-container">
          <div className="board">
            {gameState.board.map((row: any[], r: number) =>
              row.map((cell: any, c: number) => (
                <div
                  key={`${r}-${c}`}
                  className={`cell area-${cell.area.toLowerCase()} ${
                    cell.company ? getCompanyColorClasses(cell.company) : ""
                  }`}
                  onClick={() => handleCellClick(r, c)}
                  title={`Area: ${cell.area} | Row ${r+1}, Col ${c+1}`}
                >
                  {cell.company ? "" : cell.area === "SHARK" ? "" : cell.area}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="side-panel">
          {errorMsg && (
            <div className="error-message" style={{ margin: "0" }}>
              <AlertCircle size={20} /> {errorMsg}
            </div>
          )}
          
          <div className="panel-section" style={{ padding: "0", background: "transparent", border: "none", boxShadow: "none" }}>
            
            {gameState.status === "waiting" && (
              <div className="status-banner status-waiting" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <Info size={32} />
                  <div>
                    <strong>Waiting for players...</strong>
                    <div style={{ fontSize: "0.95rem", marginTop: "0.25rem", fontFamily: "'Space Mono', monospace" }}>Share code <b style={{ color: "#eab308", fontSize: "1.1rem" }}>{gameState.room_id}</b> to invite others.</div>
                    {gameState.variants && gameState.variants.length > 0 && (
                      <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "#ca8a04", fontWeight: "bold", textTransform: "uppercase" }}>
                        Active Variants: {gameState.variants.join(" • ").replace(/_/g, " ")}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", width: "100%", marginTop: "0.5rem" }}>
                  <button onClick={addBot} style={{ flex: 1, background: "#1e293b", color: "white", border: "1px solid #334155" }}>
                    <Bot size={20} /> Add Bot
                  </button>
                  <button onClick={() => sendAction("start")} style={{ flex: 2, background: "var(--primary)" }} disabled={gameState.players.length < 2}>
                    <Play size={20} /> Start Game Now
                  </button>
                </div>
              </div>
            )}
            
            {gameState.status === "playing" && (
              <div className={`status-banner ${isMyTurn ? (gameState.phase === 'expand' ? 'status-expand' : 'status-playing') : ''}`} style={!isMyTurn ? { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" } : {}}>
                {isMyTurn ? <Play size={28} /> : <RefreshCcw size={28} className={gameState.status === "playing" ? "animate-spin" : ""} />}
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "1.2rem" }}>{isMyTurn ? "Your Turn!" : "Waiting for other player..."}</strong>
                  <div style={{ fontSize: "0.95rem", textTransform: "uppercase", marginTop: "0.25rem", letterSpacing: "0.05em", fontFamily: "'Space Mono', monospace" }}>
                    Phase: {gameState.phase.replace(/[0-9]/g, '')}
                  </div>
                </div>
              </div>
            )}

            {gameState.status === "game_over" && (
              <div className="status-banner status-gameover">
                <AlertCircle size={32} />
                <div>
                  <strong style={{ fontSize: "1.2rem" }}>Game Over!</strong>
                  <div style={{ fontSize: "0.95rem", marginTop: "0.25rem" }}>Check the activity log to see who won.</div>
                </div>
              </div>
            )}
            
            {isMyTurn && gameState.phase === "expand" && (
              <div className="panel-section" style={{ border: "2px solid var(--primary)", background: "rgba(217, 119, 6, 0.1)" }}>
                <h3 style={{ marginBottom: "1rem", color: "var(--primary)" }}>Expand Territory</h3>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ background: "#0f172a", padding: "1rem", borderRadius: "12px", border: "1px solid #334155", textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 800, marginBottom: "0.5rem" }}>Company Die</div>
                    <div style={{ margin: "auto", display: "inline-block" }} className={`company-badge ${getCompanyColorClasses(gameState.current_company_die)}`}>
                      {gameState.current_company_die}
                    </div>
                  </div>
                  <div style={{ background: "#0f172a", padding: "1rem", borderRadius: "12px", border: "1px solid #334155", textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 800, marginBottom: "0.5rem" }}>Area Die</div>
                    <div style={{ fontWeight: 800, fontSize: "1.5rem", fontFamily: "'Space Mono', monospace", color: "#fff" }}>{gameState.current_area_die === "SHARK" ? "🦈" : gameState.current_area_die}</div>
                  </div>
                </div>

                {gameState.current_company_die === "black" && !gameState.variants.includes("joker_buildings") && (
                   <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "#cbd5e1" }}>Choose Wildcard Company: </label>
                    <select value={wildcardCompany} onChange={e => setWildcardCompany(e.target.value)} style={{ width: "100%" }}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
                
                {gameState.current_company_die === "gray" && gameState.variants.includes("neutral_buildings") && (
                   <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "#cbd5e1" }}>Neutral Action: </label>
                    <select value={grayAction} onChange={e => setGrayAction(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }}>
                      <option value="place">Place Gray Barrier</option>
                      <option value="remove">Remove Gray Barrier</option>
                      <option value="choose">Place any standard Company building</option>
                    </select>
                    {grayAction === "choose" && (
                        <select value={wildcardCompany} onChange={e => setWildcardCompany(e.target.value)} style={{ width: "100%" }}>
                          {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                        </select>
                    )}
                  </div>
                )}
                
                {gameState.current_company_die === "gray" && !gameState.variants.includes("neutral_buildings") && (
                   <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "#cbd5e1" }}>Choose Wildcard Company: </label>
                    <select value={wildcardCompany} onChange={e => setWildcardCompany(e.target.value)} style={{ width: "100%" }}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
                
                <div style={{ fontSize: "0.95em", color: "#94a3b8", display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", fontWeight: 600 }}>
                  <ArrowRightCircle size={20} color="var(--primary)" /> Click a valid cell on the board to build.
                </div>
              </div>
            )}

            {isMyTurn && gameState.status === "playing" && (
              <div className="panel-section" style={{ marginTop: "1rem", padding: "1.25rem" }}>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {gameState.phase === "trade1" && (
                    <button onClick={() => sendAction("roll")} style={{ flex: 1, padding: "1rem", fontSize: "1.1rem" }}>
                      🎲 Roll Dice & Expand
                    </button>
                  )}
                  {(gameState.phase === "trade1" || gameState.phase === "trade2") && (
                    <button onClick={() => sendAction("end_turn")} style={{ background: "#334155", flex: 1 }}>
                      End Turn <LogOut size={18} />
                    </button>
                  )}
                </div>

                {(gameState.phase === "trade1" || gameState.phase === "trade2") && me && (
                  <div className="trade-panel" style={{ marginTop: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "0.1em" }}>TRADE DESK</div>
                      <div className="cash-badge">
                        <DollarSign size={16} /> Cash: {me.cash.toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="trade-controls" style={{ marginBottom: "1.5rem" }}>
                      <select value={tradeCompany} onChange={e => setTradeCompany(e.target.value)} style={{ flex: 2 }}>
                        {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()} (${gameState.stock_price[c].toLocaleString()})</option>)}
                      </select>
                      <input 
                        type="number" 
                        min="1" max="5" 
                        value={tradeCount} 
                        onChange={e => setTradeCount(Number(e.target.value))} 
                        style={{ width: "80px", textAlign: "center" }}
                      />
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "1rem", marginBottom: "1.5rem", padding: "1rem", background: "#020617", borderRadius: "8px", border: "1px dashed #334155" }}>
                      <span style={{ color: "#94a3b8", fontWeight: 600 }}>Transaction Value:</span>
                      <strong style={{ fontSize: "1.25rem", color: "#fff", fontFamily: "'Space Mono', monospace" }}>${(gameState.stock_price[tradeCompany] * tradeCount).toLocaleString()}</strong>
                    </div>

                    <div className="trade-controls">
                      <button 
                        className="trade-btn-buy" 
                        onClick={() => sendAction("trade", { trade_type: "buy", company: tradeCompany, count: tradeCount })} 
                        style={{ flex: 1, padding: "1rem" }}
                        disabled={me.cash < gameState.stock_price[tradeCompany] * tradeCount}
                      >
                        <ArrowDownCircle size={20} /> BUY STOCKS
                      </button>
                      <button 
                        className="trade-btn-sell" 
                        onClick={() => sendAction("trade", { trade_type: "sell", company: tradeCompany, count: tradeCount })} 
                        style={{ flex: 1, padding: "1rem" }}
                        disabled={me.stocks[tradeCompany] < tradeCount}
                      >
                        <ArrowUpCircle size={20} /> SELL STOCKS
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h3><DollarSign size={24} color="var(--primary)" /> Stock Market</h3>
            <div className="market-grid">
              <div className="market-header">Company</div>
              <div className="market-header">Price</div>
              <div className="market-header">Supply</div>
              
              {COMPANIES.map(c => (
                <React.Fragment key={c}>
                  <div><span className={`company-${c} company-badge`} style={{ display: 'inline-block', minWidth: '70px', textAlign: 'center' }}>{c}</span></div>
                  <div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace", fontSize: "1.2rem", color: "#fff" }}>${gameState.stock_price[c].toLocaleString()}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "'Space Mono', monospace" }}>{gameState.remaining_buildings[c]} <span style={{fontSize:"0.75rem"}}>BLDGS</span></div>
                </React.Fragment>
              ))}
              
              {gameState.variants?.includes("joker_buildings") && (
                 <React.Fragment key="black">
                  <div><span className={`company-black company-badge`} style={{ display: 'inline-block', minWidth: '70px', textAlign: 'center' }}>black</span></div>
                  <div style={{ color: "#475569", fontSize: "1rem", fontStyle: "italic" }}>WILD</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "'Space Mono', monospace" }}>{gameState.remaining_buildings["black"]} <span style={{fontSize:"0.75rem"}}>BLDGS</span></div>
                </React.Fragment>
              )}
              {gameState.variants?.includes("neutral_buildings") && (
                 <React.Fragment key="gray">
                  <div><span className={`company-gray company-badge`} style={{ display: 'inline-block', minWidth: '70px', textAlign: 'center' }}>gray</span></div>
                  <div style={{ color: "#475569", fontSize: "1rem", fontStyle: "italic" }}>NEUTRAL</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "'Space Mono', monospace" }}>{gameState.remaining_buildings["gray"]} <span style={{fontSize:"0.75rem"}}>BLDGS</span></div>
                </React.Fragment>
              )}
            </div>
          </div>

          <div className="panel-section">
            <h3>Players</h3>
            {gameState.players.map((p: any) => (
              <div key={p.id} className={`player-card ${p.id === gameState.current_player ? "active-turn" : ""} ${lossAnimations[p.id] ? "loss-animation" : ""}`}>
                <div className="player-header">
                  <div className="player-name" style={{ display: "flex", alignItems: "center" }}>
                    {p.name} 
                    {p.is_bot && <span className="bot-tag"><Bot size={14}/> BOT</span>}
                    {p.id === playerId ? <span style={{ color: "var(--primary)", fontSize: "0.85rem", fontWeight: 700, marginLeft: "0.75rem", textTransform: "uppercase" }}>[You]</span> : ""}
                  </div>
                  <div className="cash-badge">
                    <DollarSign size={16} /> {p.cash.toLocaleString()}
                  </div>
                </div>
                {p.bankrupt && <div style={{ color: "#ef4444", fontWeight: 800, fontSize: "1rem", marginBottom: "0.5rem", letterSpacing: "0.1em" }}>BANKRUPT</div>}
                
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "0.05em" }}>Portfolio</div>
                <div className="portfolio">
                  {COMPANIES.map(c => (
                    <div key={c} className={`portfolio-item ${p.stocks[c] > 0 ? 'company-'+c : ''}`} style={p.stocks[c] === 0 ? { background: '#1e293b', color: '#475569' } : {}}>
                      {gameState.variants?.includes("open_hands") || p.id === playerId || gameState.status === "game_over" ? p.stocks[c] : "?"}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="panel-section" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h3>Activity Log</h3>
            <div className="logs" style={{ flex: 1 }}>
              {gameState.logs.map((log: string, i: number) => (
                <div key={i} className="log-entry">&gt; {log}</div>
              ))}
              {gameState.logs.length === 0 && <div style={{ color: "#475569", fontStyle: "italic" }}>Awaiting corporate action...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
