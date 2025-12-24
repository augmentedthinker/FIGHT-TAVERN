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
    turn: 'hero', // 'hero' or 'enemy'
    gameOver: false,
    mode: 'pvp', // 'pvp' or 'pve'
};

let gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
let players = {}; 
let activeChallenger = null;

// Helper: Broadcast Lobby Stats
function broadcastLobbyStats() {
    const connectedCount = io.engine.clientsCount;
    const heroPresent = Object.values(players).includes('hero');
    const enemyPresent = Object.values(players).includes('enemy');
    
    // A game is in progress if both are present OR if it's PvE mode
    const inProgress = (heroPresent && enemyPresent) || gameState.mode === 'pve';

    io.emit('lobby_stats', {
        connected: connectedCount,
        gameInProgress: inProgress
    });
}

// --- AI LOGIC (The "Brain") ---
function processAiTurn() {
    // Safety check: Don't attack if game is over or it's not enemy turn
    if (gameState.gameOver || gameState.turn !== 'enemy') return;

    // Wait 1.5 seconds so the player can see the turn change
    setTimeout(() => {
        // Double check state hasn't changed during delay
        if (gameState.gameOver || gameState.turn !== 'enemy') return;
        
        console.log("🤖 AI is attacking the Hero...");
        performAttack('enemy', 'hero'); 
    }, 1500);
}

// Helper: Core Attack Logic
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

    // Check Win/Loss
    if (target.hp <= 0) {
        gameState.gameOver = true;
        logMessage = `${target.name} was defeated!`;
        logColor = 'text-yellow-400 font-black text-lg';
    } else {
        // Switch Turn
        gameState.turn = targetKey;
        
        // --- AI TRIGGER CHECK ---
        // If turn passed to enemy AND we are in PvE mode, trigger the brain
        if (gameState.turn === 'enemy' && gameState.mode === 'pve') {
            processAiTurn();
        }
    }

    // Update everyone
    io.emit('game_update', {
        state: gameState,
        action: {
            attacker: attackerKey,
            roll: d20, damage, isHit, isCrit,
            log: { msg: logMessage, color: logColor, sub: logSub }
        }
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    broadcastLobbyStats();

    // 1. Join Request
    socket.on('join_game', (data) => {
        const requestedMode = data.mode || 'pvp';
        
        if (requestedMode === 'spectate') {
            players[socket.id] = 'spectator';
            socket.emit('welcome', { role: 'spectator', state: gameState });
        } 
        else if (requestedMode === 'pve') {
            // Start PvE game immediately (Simple: reset everything)
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
            gameState.mode = 'pve';
            players[socket.id] = 'hero';
            
            socket.emit('welcome', { role: 'hero', state: gameState });
            broadcastLobbyStats();
        }
        else {
            // Default PvP Join
            let role = 'spectator';
            if (!Object.values(players).includes('hero')) role = 'hero';
            else if (!Object.values(players).includes('enemy')) role = 'enemy';
            
            players[socket.id] = role;
            socket.emit('welcome', { role, state: gameState });
            broadcastLobbyStats();
        }
    });

    // 2. Challenge System
    socket.on('send_challenge', () => {
        activeChallenger = socket.id;
        socket.broadcast.emit('challenge_received');
    });

    socket.on('accept_challenge', () => {
        if (!activeChallenger || !io.sockets.sockets.get(activeChallenger)) return; 

        // Start PvP Game
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = 'pvp';

        // Assign Roles
        players[activeChallenger] = 'hero';
        players[socket.id] = 'enemy';

        io.to(activeChallenger).emit('welcome', { role: 'hero', state: gameState });
        io.to(socket.id).emit('welcome', { role: 'enemy', state: gameState });
        
        activeChallenger = null;
        broadcastLobbyStats();
        io.emit('game_update', { state: gameState });
    });

    // 3. Handle Attack
    socket.on('attack', () => {
        const role = players[socket.id];
        if (role !== gameState.turn || gameState.gameOver) return;
        
        const targetKey = role === 'hero' ? 'enemy' : 'hero';
        performAttack(role, targetKey);
    });

    // 4. Chat
    socket.on('send_chat', (msg) => {
        if(!msg || msg.trim().length === 0) return;
        let role = players[socket.id] || 'spectator';
        io.emit('chat_message', { role, text: msg.substring(0, 100) });
    });

    // 5. Reset
    socket.on('reset_game', () => {
        if (players[socket.id] === 'spectator') return;
        const currentMode = gameState.mode;
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = currentMode;
        io.emit('game_update', { state: gameState, reset: true });
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
        const role = players[socket.id];
        delete players[socket.id];
        
        if (socket.id === activeChallenger) {
            activeChallenger = null;
            io.emit('challenge_canceled');
        }

        // If active player leaves PvP, end game
        if ((role === 'hero' || role === 'enemy') && gameState.mode === 'pvp') {
            io.emit('player_left', { role: role });
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
        
        // If Hero leaves PvE, just reset
        if (role === 'hero' && gameState.mode === 'pve') {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
        
        // Auto-reset if empty
        if (Object.keys(players).length === 0) {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
            activeChallenger = null;
        }
        broadcastLobbyStats();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
