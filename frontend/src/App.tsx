import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const COMPANIES = ["red", "blue", "green", "yellow"];


function App() {
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameState, setGameState] = useState<any>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

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
      const res = await fetch("/api/rooms/create", { method: "POST" });
      const data = await res.json();
      setRoomId(data.room_id);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to create room");
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
        setErrorMsg("Failed to join room");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to join room");
    }
  };

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

  if (!ws) {
    return (
      <div className="container" style={{ alignItems: "center", justifyContent: "center" }}>
        <h1>Shark Board Game</h1>
        {errorMsg && <div style={{ color: "red", marginBottom: "1rem" }}>{errorMsg}</div>}
        <form onSubmit={joinRoom} style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "300px" }}>
          <button type="button" onClick={createRoom}>Create New Room</button>
          <hr />
          <input 
            placeholder="Room ID" 
            value={roomId} 
            onChange={e => setRoomId(e.target.value.toUpperCase())} 
            required 
          />
          <input 
            placeholder="Your Name" 
            value={playerName} 
            onChange={e => setPlayerName(e.target.value)} 
            required 
          />
          <button type="submit">Join Game</button>
        </form>
      </div>
    );
  }

  if (!gameState) return <div>Loading...</div>;

  const isMyTurn = gameState.current_player === playerId;

  return (
    <div className="container">
      <header>
        <h2>Shark - Room: {gameState.room_id}</h2>
        <div>Player: {playerName}</div>
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
                >
                  {cell.company ? cell.company[0].toUpperCase() : cell.area === "SHARK" ? "S" : cell.area}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="side-panel">
          {errorMsg && <div style={{ color: "red", padding: "0.5rem", background: "#fee" }}>{errorMsg}</div>}
          
          <div className="panel-section">
            <h3>Game Status: {gameState.status}</h3>
            {gameState.status === "waiting" && (
              <button onClick={() => sendAction("start")}>Start Game</button>
            )}
            
            {gameState.status === "playing" && (
              <div>
                <p><strong>Phase:</strong> {gameState.phase}</p>
                {isMyTurn ? (
                  <div style={{ color: "green", fontWeight: "bold" }}>Your Turn!</div>
                ) : (
                  <div>Waiting for other player...</div>
                )}
                
                {gameState.phase === "expand" && (
                  <div style={{ background: "#e6f7ff", padding: "0.5rem", marginTop: "0.5rem" }}>
                    <strong>Dice Rolled:</strong> Company = {gameState.current_company_die}, Area = {gameState.current_area_die}
                    {(gameState.current_company_die === "black" || gameState.current_company_die === "gray") && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <label>Choose Wildcard Company: </label>
                        <select value={wildcardCompany} onChange={e => setWildcardCompany(e.target.value)}>
                          {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                    <p style={{ fontSize: "0.9em", fontStyle: "italic" }}>Click an empty cell on the board to place building.</p>
                  </div>
                )}

                <div className="actions" style={{ marginTop: "1rem" }}>
                  {isMyTurn && gameState.phase === "trade1" && (
                    <button onClick={() => sendAction("roll")}>Roll Dice & Expand</button>
                  )}
                  {isMyTurn && (gameState.phase === "trade1" || gameState.phase === "trade2") && (
                    <button onClick={() => sendAction("end_turn")}>End Turn</button>
                  )}
                </div>

                {isMyTurn && (gameState.phase === "trade1" || gameState.phase === "trade2") && (
                  <div className="trade-panel" style={{ marginTop: "1rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
                    <select value={tradeCompany} onChange={e => setTradeCompany(e.target.value)}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input 
                      type="number" 
                      min="1" max="5" 
                      value={tradeCount} 
                      onChange={e => setTradeCount(Number(e.target.value))} 
                      style={{ width: "60px" }}
                    />
                    <button onClick={() => sendAction("trade", { trade_type: "buy", company: tradeCompany, count: tradeCount })}>Buy</button>
                    <button onClick={() => sendAction("trade", { trade_type: "sell", company: tradeCompany, count: tradeCount })}>Sell</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h3>Companies</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <div style={{ fontWeight: "bold" }}>Company</div>
              <div style={{ fontWeight: "bold" }}>Price</div>
              <div style={{ fontWeight: "bold" }}>Buildings</div>
              {COMPANIES.map(c => (
                <React.Fragment key={c}>
                  <div className={`company-${c}`} style={{ padding: "2px 8px", borderRadius: "4px" }}>{c}</div>
                  <div>${gameState.stock_price[c]}</div>
                  <div>{gameState.remaining_buildings[c]}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Players</h3>
            {gameState.players.map((p: any) => (
              <div key={p.id} style={{ marginBottom: "1rem", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px", background: p.id === gameState.current_player ? "#e6f7ff" : "#fff" }}>
                <strong>{p.name} {p.id === playerId ? "(You)" : ""}</strong>
                {p.bankrupt && <span style={{ color: "red", marginLeft: "0.5rem" }}>[BANKRUPT]</span>}
                <div>Cash: ${p.cash}</div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  {COMPANIES.map(c => (
                    <span key={c} className={`company-${c}`} style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "0.85em" }}>
                      {p.stocks[c]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="panel-section">
            <h3>Logs</h3>
            <div className="logs">
              {gameState.logs.map((log: string, i: number) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
