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

// Helper: Broadcast Lobby Stats
function broadcastLobbyStats() {
    const connectedCount = io.engine.clientsCount;
    const heroPresent = Object.values(players).includes('hero');
    const enemyPresent = Object.values(players).includes('enemy');
    
    // A game is waiting if one role is taken but not both, AND it's not a PvE game (where enemy is CPU)
    const waiting = (heroPresent && !enemyPresent) && gameState.mode === 'pvp';
    
    // A game is in progress if both are present OR if it's PvE mode
    const inProgress = (heroPresent && enemyPresent) || gameState.mode === 'pve';

    io.emit('lobby_stats', {
        connected: connectedCount,
        waitingForOpponent: waiting,
        gameInProgress: inProgress
    });
}

// Helper: AI Turn Logic
function processAiTurn() {
    if (gameState.gameOver || gameState.turn !== 'enemy') return;

    setTimeout(() => {
        // Double check game state after delay
        if (gameState.gameOver || gameState.turn !== 'enemy') return;

        console.log("AI is attacking...");
        performAttack('enemy', 'hero'); // AI is always 'enemy' for now
    }, 1500); // 1.5s delay for "thinking"
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

    if (target.hp <= 0) {
        gameState.gameOver = true;
        logMessage = `${target.name} was defeated!`;
        logColor = 'text-yellow-400 font-black text-lg';
    } else {
        gameState.turn = targetKey;
        // If switching TO enemy and it's PvE, trigger AI again
        if (gameState.turn === 'enemy' && gameState.mode === 'pve') {
            processAiTurn();
        }
    }

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

    // 1. Join Request (Replaces auto-assign)
    socket.on('join_game', (data) => {
        const requestedMode = data.mode || 'pvp'; // 'pvp', 'pve', 'spectate'
        
        let role = 'spectator';

        if (requestedMode === 'spectate') {
            role = 'spectator';
        } 
        else if (requestedMode === 'pve') {
            // Force reset if starting new PvE
            if (!Object.values(players).includes('hero')) {
                gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
                gameState.mode = 'pve';
                role = 'hero';
            } else {
                // Game exists, just spectate
                role = 'spectator';
            }
        } 
        else { // PvP
            gameState.mode = 'pvp'; // Ensure mode is PvP
            if (!Object.values(players).includes('hero')) role = 'hero';
            else if (!Object.values(players).includes('enemy')) role = 'enemy';
        }

        players[socket.id] = role;
        socket.emit('welcome', { role, state: gameState });
        broadcastLobbyStats();
    });

    // 2. Handle Attack
    socket.on('attack', () => {
        const role = players[socket.id];
        if (role !== gameState.turn || gameState.gameOver) return;
        
        const targetKey = role === 'hero' ? 'enemy' : 'hero';
        performAttack(role, targetKey);
    });

    // 3. Chat
    socket.on('send_chat', (msg) => {
        if(!msg || msg.trim().length === 0) return;
        let role = players[socket.id] || 'spectator';
        io.emit('chat_message', { role, text: msg.substring(0, 100) });
    });

    // 4. Reset
    socket.on('reset_game', () => {
        // Only players can reset
        if (players[socket.id] === 'spectator') return;

        // Keep the same mode
        const currentMode = gameState.mode;
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = currentMode;
        
        io.emit('game_update', { state: gameState, reset: true });
        broadcastLobbyStats(); // Update status text
    });

    // 5. Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        // Auto-reset if empty
        if (Object.keys(players).length === 0) {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
        broadcastLobbyStats();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
