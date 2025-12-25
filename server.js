const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 1. THE BRAIN: CHARACTER ROSTER ---
// This is the source of truth. If you change HP here, it updates for everyone.
const CHARACTERS = {
    warrior: { name: 'Warrior', hp: 50, max: 50, ac: 14, dmgDie: 8, dmgMod: 2, img: 'https://image.pollinations.ai/prompt/fantasy%20warrior%20portrait%20rugged%20face%20scarred%20armor%20heroic%20lighting%201970s%20dnd%20art%20style%20oil%20painting?width=400&height=400&nologin=true&seed=99' },
    mage: { name: 'Mage', hp: 30, max: 30, ac: 11, dmgDie: 10, dmgMod: 4, img: 'https://image.pollinations.ai/prompt/mystical%20wizard%20portrait%20glowing%20eyes%20blue%20robes%20fantasy%20art?width=400&height=400&nologin=true&seed=42' },
    rogue: { name: 'Rogue', hp: 35, max: 35, ac: 13, dmgDie: 6, dmgMod: 5, img: 'https://image.pollinations.ai/prompt/hooded%20rogue%20assassin%20shadows%20dagger%20fantasy%20art?width=400&height=400&nologin=true&seed=77' },
    cleric: { name: 'Cleric', hp: 45, max: 45, ac: 16, dmgDie: 6, dmgMod: 1, img: 'https://image.pollinations.ai/prompt/holy%20cleric%20fantasy%20gold%20armor%20healing%20light?width=400&height=400&nologin=true&seed=101' },
    ogre: { name: 'Ogre', hp: 60, max: 60, ac: 12, dmgDie: 6, dmgMod: 3, img: 'https://image.pollinations.ai/prompt/fearsome%20ogre%20portrait%20fantasy%20art%201970s%20style?width=400&height=400&nologin=true&seed=505' },
    dragon: { name: 'Red Dragon', hp: 80, max: 80, ac: 15, dmgDie: 12, dmgMod: 3, img: 'https://image.pollinations.ai/prompt/red%20dragon%20head%20roaring%20fire%20fantasy%20art%20epic?width=400&height=400&nologin=true&seed=666' }
};

// Default empty state
const INITIAL_STATE = {
    hero: { ...CHARACTERS.warrior },
    enemy: { ...CHARACTERS.ogre },
    turn: 'hero', 
    gameOver: false,
    mode: 'pvp', 
};

let gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
let players = {}; 
let activeChallenger = null;
let challengerChar = 'warrior'; // Stores the challenger's choice
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
    
    // 1. Roll to Hit
    const d20 = Math.floor(Math.random() * 20) + 1;
    const hitTotal = d20 + (attacker.dmgMod > 2 ? 3 : 1); // Simple hit bonus logic
    const isHit = d20 === 20 || hitTotal >= target.ac;
    const isCrit = d20 === 20;
    
    let damage = 0;
    let logMessage = '', logColor = '', logSub = '';

    if (isHit) {
        // 2. Calculate Damage based on character stats
        damage = Math.floor(Math.random() * attacker.dmgDie) + 1 + attacker.dmgMod;
        if (isCrit) damage += Math.floor(Math.random() * attacker.dmgDie) + 1;
        
        target.hp = Math.max(0, target.hp - damage);
        
        logMessage = isCrit ? `CRIT! ${attacker.name} deals ${damage}!` : `${attacker.name} hits for ${damage} damage!`;
        logColor = isCrit ? 'text-yellow-400' : 'text-red-400';
    } else {
        logMessage = `${attacker.name} missed!`;
        logColor = 'text-slate-400';
    }
    logSub = `Rolled ${d20} vs AC ${target.ac}`;

    if (target.hp <= 0) {
        gameState.gameOver = true;
        logMessage = `${target.name} defeated!`;
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

    socket.on('check_rejoin', () => {
        const role = players[socket.id];
        if (role && (role === 'hero' || role === 'enemy')) {
            socket.emit('welcome', { role: role, state: gameState });
        }
    });

    socket.on('join_game', (data) => {
        const requestedMode = data.mode || 'pvp';
        const charId = data.charId || 'warrior';

        if (requestedMode === 'spectate') {
            players[socket.id] = 'spectator';
            socket.emit('welcome', { role: 'spectator', state: gameState });
        } 
        else if (requestedMode === 'pve') {
            // Player vs Computer
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
            gameState.mode = 'pve';
            
            // Set Player Character
            gameState.hero = { ...CHARACTERS[charId] };
            
            // Set AI Character (Default Ogre, or random)
            gameState.enemy = { ...CHARACTERS['ogre'] };

            players[socket.id] = 'hero';
            socket.emit('welcome', { role: 'hero', state: gameState });
            broadcastLobbyStats();
        }
    });

    socket.on('send_challenge', (data) => {
        activeChallenger = socket.id;
        challengerChar = data.charId || 'warrior'; // Remember what they picked
        socket.broadcast.emit('challenge_received');
    });

    socket.on('accept_challenge', (data) => {
        if (!activeChallenger || !io.sockets.sockets.get(activeChallenger)) return; 
        
        if(resetTimeout) clearTimeout(resetTimeout);

        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = 'pvp';
        
        // 1. Assign Challenger (Hero)
        players[activeChallenger] = 'hero';
        gameState.hero = { ...CHARACTERS[challengerChar] };

        // 2. Assign Accepter (Enemy/Rival)
        players[socket.id] = 'enemy';
        const myChar = data.charId || 'ogre';
        gameState.enemy = { ...CHARACTERS[myChar] };

        // Start Game
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

        if ((role === 'hero' || role === 'enemy') && gameState.mode === 'pvp') {
            io.emit('player_left', { role: role });
            resetTimeout = setTimeout(() => {
                gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
                broadcastLobbyStats();
            }, 30000);
        }
        
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
