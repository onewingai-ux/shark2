import './style.css'

const ANIMALS = ["Lion", "Rhino", "Elephant", "Leopard", "Zebra"]

// State
let ws: WebSocket | null = null;
let gameState: any = null;
let currentRoomId: string | null = null;
let currentPlayerId: string | null = null;
let currentPlayerName: string | null = null;

// UI Elements
const appDiv = document.querySelector<HTMLDivElement>('#app')!

// Helper to escape HTML to prevent XSS
function escapeHTML(str: string | null | undefined): string {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag as string] || tag)
    );
}

// Initialize App
function render() {
  if (!currentRoomId) {
    renderLobby();
  } else if (gameState) {
    renderGame();
  } else {
    appDiv.innerHTML = `<div>Connecting to room ${escapeHTML(currentRoomId)}...</div>`;
  }
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function renderLobby() {
    appDiv.innerHTML = `
        <div class="lobby-container">
            <h1>Botswana Web Game</h1>
            <div class="form-group">
                <label>Player Name:</label>
                <input type="text" id="playerName" value="Player_${generateId()}" />
            </div>
            <div class="form-group">
                <label>Room Code (Create or Join):</label>
                <input type="text" id="roomCode" value="${generateId()}" />
            </div>
            <button id="joinBtn">Join / Create Room</button>
        </div>
    `;

    document.getElementById('joinBtn')?.addEventListener('click', () => {
        const nameInput = (document.getElementById('playerName') as HTMLInputElement).value;
        const roomInput = (document.getElementById('roomCode') as HTMLInputElement).value;
        
        if (nameInput && roomInput) {
            currentPlayerName = nameInput;
            currentRoomId = roomInput;
            currentPlayerId = localStorage.getItem(`player_id_${currentRoomId}`) || generateId();
            localStorage.setItem(`player_id_${currentRoomId}`, currentPlayerId);
            
            render(); // show loading
            connectWebSocket();
        }
    });
}

function connectWebSocket() {
    const wsUrl = `ws://${window.location.hostname}:8000/ws/${currentRoomId}/${currentPlayerId}?name=${currentPlayerName}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'game_state') {
            gameState = data.state;
            render();
        } else if (data.type === 'error') {
            alert("Error: " + data.message);
        }
    };

    ws.onclose = () => {
        console.log("WebSocket disconnected. Retrying...");
        setTimeout(() => {
            if (currentRoomId) connectWebSocket();
        }, 3000);
    };
}

function renderGame() {
    if (!gameState) return;
    
    const me = gameState.players.find((p: any) => p.id === currentPlayerId);
    const isMyTurn = gameState.status === 'playing' && gameState.players[gameState.current_player_idx]?.id === currentPlayerId;
    const currentTurnPlayer = gameState.players[gameState.current_player_idx];
    
    let html = `
        <div class="game-container">
            <div class="header">
                <h2>Room: ${escapeHTML(currentRoomId)} | Round: ${gameState.round_number}/${gameState.total_rounds} | Status: ${gameState.status}</h2>
                <div>Current Turn: <strong>${escapeHTML(currentTurnPlayer?.name || '-')}</strong> (${gameState.status === 'playing' ? gameState.turn_stage : '-'})</div>
            </div>
    `;

    // Opponents
    html += `<div class="opponents"><h3>Opponents</h3><div class="opponents-list">`;
    gameState.players.forEach((p: any) => {
        if (p.id !== currentPlayerId) {
            const isTurn = gameState.status === 'playing' && p.id === currentTurnPlayer?.id;
            html += `
                <div class="opponent-card ${!p.connected ? 'disconnected' : ''} ${isTurn ? 'active-turn' : ''}">
                    <h4>${escapeHTML(p.name)} (Score: ${p.score})</h4>
                    <div>Cards in hand: ${p.hand.length}</div>
                    <div class="tokens-mini">
                        ${ANIMALS.map(a => `<span class="token ${a.toLowerCase()}">${a[0]}: ${p.tokens[a]}</span>`).join('')}
                    </div>
                </div>
            `;
        }
    });
    html += `</div></div>`;

    // Board
    html += `<div class="board"><h3>Board</h3><div class="stacks">`;
    ANIMALS.forEach(animal => {
        const stack = gameState.stacks[animal];
        const topCard = stack.length > 0 ? stack[stack.length - 1].value : '-';
        const tokensLeft = gameState.tokens_pool[animal];
        
        html += `
            <div class="stack ${animal.toLowerCase()}">
                <div class="animal-name">${animal}</div>
                <div class="top-card">Value: ${topCard}</div>
                <div class="stack-count">Cards: ${stack.length}</div>
                <button class="take-token-btn" data-animal="${animal}" ${(!isMyTurn || gameState.turn_stage !== 'take_token' || tokensLeft <= 0) ? 'disabled' : ''}>
                    Take Token (${tokensLeft} left)
                </button>
            </div>
        `;
    });
    html += `</div></div>`;

    // My Area
    if (me) {
        html += `
            <div class="my-area ${isMyTurn ? 'active-turn' : ''}">
                <h3>My Area - ${escapeHTML(me.name)} (Score: ${me.score})</h3>
                
                <div class="my-tokens">
                    <strong>My Tokens: </strong>
                    ${ANIMALS.map(a => `<span class="token ${a.toLowerCase()}">${a}: ${me.tokens[a]}</span>`).join('')}
                </div>
                
                <div class="my-hand">
                    <h4>My Hand</h4>
                    <div class="cards">
        `;
        
        me.hand.forEach((card: any, idx: number) => {
            if (card.value >= 0) { // check if visible
                html += `
                    <button class="card-btn ${card.animal.toLowerCase()}" data-idx="${idx}" ${(!isMyTurn || gameState.turn_stage !== 'play_card') ? 'disabled' : ''}>
                        ${card.animal} ${card.value}
                    </button>
                `;
            }
        });
        
        html += `</div></div></div>`;
    }

    // Controls
    html += `<div class="controls">`;
    if (gameState.status === 'waiting' && gameState.players.length >= 2) {
        html += `<button id="startGameBtn">Start Game</button>`;
    } else if (gameState.status === 'round_over') {
        html += `<button id="nextRoundBtn">Next Round</button>`;
    }
    html += `</div></div>`;
    
    appDiv.innerHTML = html;
    attachGameListeners();
}

function attachGameListeners() {
    document.getElementById('startGameBtn')?.addEventListener('click', () => {
        ws?.send(JSON.stringify({ action: "start_game" }));
    });
    
    document.getElementById('nextRoundBtn')?.addEventListener('click', () => {
        ws?.send(JSON.stringify({ action: "next_round" }));
    });

    document.querySelectorAll('.card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx || '0', 10);
            ws?.send(JSON.stringify({ action: "play_card", card_index: idx }));
        });
    });

    document.querySelectorAll('.take-token-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const animal = (e.currentTarget as HTMLElement).dataset.animal;
            ws?.send(JSON.stringify({ action: "take_token", animal }));
        });
    });
}

render();
