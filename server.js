const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- GAME CONFIGURATION ---
const INITIAL_STATE = {
    hero: { hp: 50, max: 50, ac: 15, name: 'Warrior', dmgDie: 8, dmgMod: 2 },
    enemy: { hp: 45, max: 45, ac: 12, name: 'Ogre', dmgDie: 6, dmgMod: 2 },
    turn: 'hero', 
    gameOver: false,
    mode: 'pvp', 
};

let gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
let players = {}; 
let activeChallenger = null;
let resetTimeout = null;

function broadcastLobbyStats() {
    const connectedCount = io.engine.clientsCount;
    const heroPresent = Object.values(players).includes('hero');
    const enemyPresent = Object.values(players).includes('enemy');
    const inProgress = (heroPresent && enemyPresent) || gameState.mode === 'pve';

    io.emit('lobby_stats', {
        connected: connectedCount,
        gameInProgress: inProgress
    });
}

function processAiTurn() {
    if (gameState.gameOver || gameState.turn !== 'enemy') return;
    setTimeout(() => {
        if (gameState.gameOver || gameState.turn !== 'enemy') return;
        performAttack('enemy', 'hero'); 
    }, 1500);
}

function performAttack(attackerKey, targetKey) {
    const attacker = gameState[attackerKey];
    const target = gameState[targetKey];
    const d20 = Math.floor(Math.random() * 20) + 1;
    const hitTotal = d20 + 3; 
    const isHit = d20 === 20 || hitTotal >= target.ac;
    const isCrit = d20 === 20;
    let damage = 0;
    let logMessage = '', logColor = '', logSub = '';

    if (isHit) {
        damage = Math.floor(Math.random() * attacker.dmgDie) + 1 + attacker.dmgMod;
        if (isCrit) damage += Math.floor(Math.random() * attacker.dmgDie) + 1;
        target.hp = Math.max(0, target.hp - damage);
        logMessage = isCrit ? `CRITICAL HIT! ${attacker.name} deals ${damage}!` : `${attacker.name} hits for ${damage} damage!`;
        logColor = isCrit ? 'text-yellow-400' : 'text-red-400';
    } else {
        logMessage = `${attacker.name} missed!`;
        logColor = 'text-slate-400';
    }
    logSub = `Rolled ${d20} + 3 = ${hitTotal} (vs AC ${target.ac})`;

    if (target.hp <= 0) {
        gameState.gameOver = true;
        logMessage = `${target.name} was defeated!`;
        logColor = 'text-yellow-400 font-black text-lg';
    } else {
        gameState.turn = targetKey;
        if (gameState.turn === 'enemy' && gameState.mode === 'pve') processAiTurn();
    }

    io.emit('game_update', {
        state: gameState,
        action: { attacker: attackerKey, roll: d20, damage, isHit, isCrit, log: { msg: logMessage, color: logColor, sub: logSub } }
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    broadcastLobbyStats();

    // --- REJOIN MECHANISM (Fix for Limbo State) ---
    socket.on('check_rejoin', () => {
        const role = players[socket.id];
        // If server thinks this socket is already playing, send them back into battle
        if (role && (role === 'hero' || role === 'enemy')) {
            socket.emit('welcome', { role: role, state: gameState });
        }
    });

    socket.on('join_game', (data) => {
        const requestedMode = data.mode || 'pvp';
        if (requestedMode === 'spectate') {
            players[socket.id] = 'spectator';
            socket.emit('welcome', { role: 'spectator', state: gameState });
        } 
        else if (requestedMode === 'pve') {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
            gameState.mode = 'pve';
            players[socket.id] = 'hero';
            socket.emit('welcome', { role: 'hero', state: gameState });
            broadcastLobbyStats();
        }
    });

    socket.on('send_challenge', () => {
        activeChallenger = socket.id;
        socket.broadcast.emit('challenge_received');
    });

    socket.on('accept_challenge', () => {
        if (!activeChallenger || !io.sockets.sockets.get(activeChallenger)) return; 
        
        // Clear any pending reset
        if(resetTimeout) clearTimeout(resetTimeout);

        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = 'pvp';
        players[activeChallenger] = 'hero';
        players[socket.id] = 'enemy';

        // Send welcome to both players
        io.to(activeChallenger).emit('welcome', { role: 'hero', state: gameState });
        io.to(socket.id).emit('welcome', { role: 'enemy', state: gameState });
        
        activeChallenger = null;
        broadcastLobbyStats();
        io.emit('game_update', { state: gameState });
    });

    socket.on('attack', () => {
        const role = players[socket.id];
        if (role !== gameState.turn || gameState.gameOver) return;
        performAttack(role, role === 'hero' ? 'enemy' : 'hero');
    });

    socket.on('send_chat', (msg) => {
        if(!msg || msg.trim().length === 0) return;
        io.emit('chat_message', { role: players[socket.id] || 'spectator', text: msg.substring(0, 100) });
    });

    socket.on('reset_game', () => {
        if (players[socket.id] === 'spectator') return;
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        io.emit('game_update', { state: gameState, reset: true });
        broadcastLobbyStats();
    });

    socket.on('disconnect', () => {
        const role = players[socket.id];
        delete players[socket.id];
        
        if (socket.id === activeChallenger) {
            activeChallenger = null;
            io.emit('challenge_canceled');
        }

        // If PvP player disconnects
        if ((role === 'hero' || role === 'enemy') && gameState.mode === 'pvp') {
            io.emit('player_left', { role: role });
            // Wait for the other player to click "Back to Lobby" or reset after 30s
            resetTimeout = setTimeout(() => {
                gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
                broadcastLobbyStats();
            }, 30000);
        }
        
        // If PvE or empty, reset immediately
        if ((role === 'hero' && gameState.mode === 'pve') || Object.keys(players).length === 0) {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
        
        broadcastLobbyStats();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
