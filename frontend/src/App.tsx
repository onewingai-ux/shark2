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
  const [variants, setVariants] = useState<string[]>([]);

  const [tradeCompany, setTradeCompany] = useState("red");
  const [tradeCount, setTradeCount] = useState(1);
  const [wildcardCompany, setWildcardCompany] = useState("red");

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
        setGameState(data.state);
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
    if (comp === "black" || comp === "gray") {
      comp = wildcardCompany;
    }
    
    sendAction("expand", { row: r, col: c, company: comp });
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
              <AlertCircle size={18} />
              {errorMsg}
            </div>
          )}
          
          <div className="lobby-form">
            <button type="button" onClick={() => setShowHowToPlay(true)} style={{ background: "transparent", color: "var(--primary)", border: "1px solid var(--primary)", marginBottom: "1rem" }}>
              <HelpCircle size={18} /> How to Play
            </button>
            
            <div className="variant-selection" style={{ background: "transparent", border: "1px solid #cbd5e1" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Settings size={14} /> GAME OPTIONS
              </div>
               <label className="variant-label">
                <input type="checkbox" checked={variants.includes("open_hands")} onChange={() => toggleVariant("open_hands")} />
                Open Hands (Everyone sees exact stock counts)
              </label>
              <label className="variant-label">
                <input type="checkbox" checked={variants.includes("short_game")} onChange={() => toggleVariant("short_game")} />
                Short Game (Ends at $10,000 instead of $15,000)
              </label>
            </div>
            
            <button type="button" onClick={createRoom} style={{ background: "#0f172a" }}>
              <Play size={18} /> Create New Room
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
              <button type="submit">Join Game</button>
            </form>
          </div>
        </div>
        
        {showHowToPlay && (
          <div className="how-to-play-modal" onClick={() => setShowHowToPlay(false)}>
            <div className="how-to-play-content" onClick={e => e.stopPropagation()}>
              <button className="close-button" onClick={() => setShowHowToPlay(false)}><X size={24} /></button>
              <h2>How to Play Shark 🦈</h2>
              
              <h3>Objective</h3>
              <p>Be the wealthiest player when the game ends. You earn wealth by buying and selling stocks, expanding companies, and triggering hostile takeovers.</p>

              <h3>Turn Structure</h3>
              <ul>
                <li><strong>Trade (Optional):</strong> Buy up to 5 stocks (total across all companies) and/or sell any number of stocks. Stocks must be ≥ $1,000 to trade.</li>
                <li><strong>Expand (Mandatory):</strong> Roll the Company and Area dice. Place a building of the rolled company color onto an empty cell in the rolled area. (Black/Gray dies are wildcards).</li>
                <li><strong>Trade Again (Optional):</strong> You can buy/sell again, observing the 5-stock buy limit for the whole turn.</li>
              </ul>
              
              <h3>Placing Buildings</h3>
              <ul>
                <li><strong>Lone Building:</strong> Placing a building not orthogonally adjacent to any other buildings grants you a $1,000 bonus.</li>
                <li><strong>Chains:</strong> Placing a building adjacent to others of the SAME color forms a chain. The stock price becomes $1,000 × (number of buildings in chain). You get a cash bonus equal to the new stock price!</li>
                <li><strong>Hostile Takeover:</strong> You can place adjacent to an OPPOSING company's building ONLY IF your newly formed chain is strictly larger than the opposing chain. You destroy the opposing buildings, dropping their stock price!</li>
              </ul>
              
              <h3>Dividends & Losses</h3>
              <p>Whenever a company's stock price goes UP, everyone holding that stock gets paid the difference in cash. When it goes DOWN (due to a takeover), everyone (except the current player) pays the difference! If you can't pay, you must sell stocks at half price or go bankrupt.</p>
              
              <h3>Game End</h3>
              <p>The game ends when any stock reaches $15,000, all buildings of a company are used, or all stocks of all companies are bought.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!gameState) return <div className="lobby-container"><div className="lobby-card">Loading Game State...</div></div>;

  const isMyTurn = gameState.current_player === playerId;
  const me = gameState.players.find((p: any) => p.id === playerId);

  return (
    <div className="container">
      <header>
        <h2>🦈 SHARK <span style={{ color: "#94a3b8", fontSize: "1rem" }}>Room: {gameState.room_id}</span></h2>
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
                    cell.company ? `company-${cell.company}` : ""
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
              <AlertCircle size={18} /> {errorMsg}
            </div>
          )}
          
          <div className="panel-section" style={{ padding: "0", background: "transparent", border: "none", boxShadow: "none" }}>
            
            {gameState.status === "waiting" && (
              <div className="status-banner status-waiting" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <Info size={24} />
                  <div>
                    <strong>Waiting for players...</strong>
                    <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>Share code <b>{gameState.room_id}</b> to invite others.</div>
                    {gameState.variants && gameState.variants.length > 0 && (
                      <div style={{ fontSize: "0.75rem", marginTop: "0.25rem", color: "#854d0e", fontWeight: "bold" }}>
                        Variants: {gameState.variants.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                  <button onClick={addBot} style={{ flex: 1, background: "#0f172a", color: "white" }}>
                    <Bot size={18} /> Add Bot
                  </button>
                  <button onClick={() => sendAction("start")} style={{ flex: 1, background: "#ca8a04" }} disabled={gameState.players.length < 2}>
                    <Play size={18} /> Start Game Now
                  </button>
                </div>
              </div>
            )}
            
            {gameState.status === "playing" && (
              <div className={`status-banner ${isMyTurn ? (gameState.phase === 'expand' ? 'status-expand' : 'status-playing') : ''}`} style={!isMyTurn ? { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" } : {}}>
                {isMyTurn ? <Play size={24} /> : <RefreshCcw size={24} className={gameState.status === "playing" ? "animate-spin" : ""} />}
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "1.1rem" }}>{isMyTurn ? "Your Turn!" : "Waiting for other player..."}</strong>
                  <div style={{ fontSize: "0.9rem", textTransform: "capitalize", marginTop: "0.25rem" }}>
                    Phase: {gameState.phase.replace(/[0-9]/g, '')}
                  </div>
                </div>
              </div>
            )}

            {gameState.status === "game_over" && (
              <div className="status-banner status-gameover">
                <AlertCircle size={24} />
                <div>
                  <strong>Game Over!</strong>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>Check the logs to see who won.</div>
                </div>
              </div>
            )}
            
            {isMyTurn && gameState.phase === "expand" && (
              <div className="panel-section" style={{ border: "2px solid var(--primary)", background: "#eff6ff" }}>
                <h3 style={{ marginBottom: "0.5rem", borderBottom: "none", color: "var(--primary)" }}>Expand Territory</h3>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ background: "#fff", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #bfdbfe", textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Company</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem", textTransform: "capitalize", margin: "auto", display: "inline-block", padding: "0 0.5rem" }} className={['black', 'gray'].includes(gameState.current_company_die) ? '' : `company-${gameState.current_company_die} company-badge`}>
                      {gameState.current_company_die}
                    </div>
                  </div>
                  <div style={{ background: "#fff", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #bfdbfe", textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Area</div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{gameState.current_area_die === "SHARK" ? "🦈" : gameState.current_area_die}</div>
                  </div>
                </div>

                {(gameState.current_company_die === "black" || gameState.current_company_die === "gray") && (
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>Choose Wildcard Company: </label>
                    <select value={wildcardCompany} onChange={e => setWildcardCompany(e.target.value)} style={{ width: "100%", background: "white", color: "var(--text-main)" }}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ fontSize: "0.9em", color: "#475569", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <ArrowRightCircle size={16} /> Click an empty cell on the board to build.
                </div>
              </div>
            )}

            {isMyTurn && gameState.status === "playing" && (
              <div className="panel-section" style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {gameState.phase === "trade1" && (
                    <button onClick={() => sendAction("roll")} style={{ flex: 1 }}>
                      🎲 Roll & Expand
                    </button>
                  )}
                  {(gameState.phase === "trade1" || gameState.phase === "trade2") && (
                    <button onClick={() => sendAction("end_turn")} style={{ background: "#64748b", flex: 1 }}>
                      End Turn <LogOut size={16} />
                    </button>
                  )}
                </div>

                {(gameState.phase === "trade1" || gameState.phase === "trade2") && me && (
                  <div className="trade-panel" style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>TRADE DESK</div>
                      <div className="cash-badge" style={{ fontSize: "0.9rem" }}>
                        <DollarSign size={14} /> Available Cash: {me.cash.toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="trade-controls" style={{ marginBottom: "1rem" }}>
                      <select value={tradeCompany} onChange={e => setTradeCompany(e.target.value)} style={{ flex: 2, background: "white", color: "var(--text-main)" }}>
                        {COMPANIES.map(c => <option key={c} value={c}>{c.toUpperCase()} (${gameState.stock_price[c].toLocaleString()})</option>)}
                      </select>
                      <input 
                        type="number" 
                        min="1" max="5" 
                        value={tradeCount} 
                        onChange={e => setTradeCount(Number(e.target.value))} 
                        style={{ width: "70px", textAlign: "center", background: "white", color: "var(--text-main)" }}
                      />
                    </div>
                    
                    <div className="transaction-value" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem", marginBottom: "1rem", padding: "0.5rem", background: "white", borderRadius: "6px", border: "1px dashed #cbd5e1" }}>
                      <span style={{ color: "#64748b" }}>Transaction Value:</span>
                      <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>${(gameState.stock_price[tradeCompany] * tradeCount).toLocaleString()}</strong>
                    </div>

                    <div className="trade-controls">
                      <button 
                        className="trade-btn-buy" 
                        onClick={() => sendAction("trade", { trade_type: "buy", company: tradeCompany, count: tradeCount })} 
                        style={{ flex: 1 }}
                        disabled={me.cash < gameState.stock_price[tradeCompany] * tradeCount}
                      >
                        <ArrowDownCircle size={16} /> Buy
                      </button>
                      <button 
                        className="trade-btn-sell" 
                        onClick={() => sendAction("trade", { trade_type: "sell", company: tradeCompany, count: tradeCount })} 
                        style={{ flex: 1 }}
                        disabled={me.stocks[tradeCompany] < tradeCount}
                      >
                        <ArrowUpCircle size={16} /> Sell
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h3><DollarSign size={20} /> Stock Market</h3>
            <div className="market-grid">
              <div className="market-header">Company</div>
              <div className="market-header">Price</div>
              <div className="market-header">Supply</div>
              
              {COMPANIES.map(c => (
                <React.Fragment key={c}>
                  <div><span className={`company-${c} company-badge`} style={{ display: 'inline-block', minWidth: '60px', textAlign: 'center' }}>{c}</span></div>
                  <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "1.1rem" }}>${gameState.stock_price[c].toLocaleString()}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{gameState.remaining_buildings[c]} / 18 bldgs</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Players</h3>
            {gameState.players.map((p: any) => (
              <div key={p.id} className={`player-card ${p.id === gameState.current_player ? "active-turn" : ""}`}>
                <div className="player-header">
                  <div className="player-name" style={{ display: "flex", alignItems: "center" }}>
                    {p.name} 
                    {p.is_bot && <span className="bot-tag"><Bot size={12}/> BOT</span>}
                    {p.id === playerId ? <span style={{ color: "var(--primary)", fontSize: "0.85rem", fontWeight: 500, marginLeft: "0.5rem" }}>(You)</span> : ""}
                  </div>
                  <div className="cash-badge">
                    <DollarSign size={14} /> {p.cash.toLocaleString()}
                  </div>
                </div>
                {p.bankrupt && <div style={{ color: "#ef4444", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>BANKRUPT</div>}
                
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Portfolio</div>
                <div className="portfolio">
                  {COMPANIES.map(c => (
                    <div key={c} className={`portfolio-item ${p.stocks[c] > 0 ? 'company-'+c : ''}`} style={p.stocks[c] === 0 ? { background: '#e2e8f0', color: '#94a3b8', boxShadow: 'none' } : {}}>
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
              {gameState.logs.length === 0 && <div style={{ color: "#64748b", fontStyle: "italic" }}>No activity yet...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
