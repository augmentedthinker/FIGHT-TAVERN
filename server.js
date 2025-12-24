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
    logs: [] 
};

// Deep copy to reset game
let gameState = JSON.parse(JSON.stringify(INITIAL_STATE));

// Track connected sockets: { socketId: 'hero' | 'enemy' | 'spectator' }
let players = {}; 

// Helper: Broadcast Lobby Stats
function broadcastLobbyStats() {
    const connectedCount = io.engine.clientsCount;
    const heroPresent = Object.values(players).includes('hero');
    const enemyPresent = Object.values(players).includes('enemy');
    
    io.emit('lobby_stats', {
        connected: connectedCount,
        waitingForOpponent: (heroPresent && !enemyPresent) || (!heroPresent && enemyPresent),
        gameInProgress: (heroPresent && enemyPresent)
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    broadcastLobbyStats();

    // 1. Join Request
    socket.on('join_game', (data) => {
        let role = 'spectator';
        
        // Simple first-come-first-served logic
        if (!Object.values(players).includes('hero')) {
            role = 'hero';
        } else if (!Object.values(players).includes('enemy')) {
            role = 'enemy';
        }
        
        players[socket.id] = role;
        socket.emit('welcome', { role, state: gameState });
        broadcastLobbyStats();
    });

    // 2. Handle Attack
    socket.on('attack', () => {
        const role = players[socket.id];
        if (role !== gameState.turn || gameState.gameOver) return;
        
        // Define attacker/target based on role
        const attackerKey = role;
        const targetKey = role === 'hero' ? 'enemy' : 'hero';
        
        const attacker = gameState[attackerKey];
        const target = gameState[targetKey];

        // Roll Logic
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
        }

        io.emit('game_update', {
            state: gameState,
            action: {
                attacker: attackerKey,
                roll: d20, damage, isHit, isCrit,
                log: { msg: logMessage, color: logColor, sub: logSub }
            }
        });
    });

    // 3. Chat
    socket.on('send_chat', (msg) => {
        if(!msg || msg.trim().length === 0) return;
        let role = players[socket.id] || 'spectator';
        io.emit('chat_message', { role, text: msg.substring(0, 100) });
    });

    // 4. Reset
    socket.on('reset_game', () => {
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        io.emit('game_update', { state: gameState, reset: true });
    });

    // 5. Disconnect
    socket.on('disconnect', () => {
        const role = players[socket.id];
        delete players[socket.id];

        // If an ACTIVE player leaves, notify and reset
        if (role === 'hero' || role === 'enemy') {
            io.emit('player_left', { role: role });
            // Reset state for the next people
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
        
        broadcastLobbyStats();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
