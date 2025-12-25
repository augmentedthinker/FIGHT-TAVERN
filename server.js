const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 1. THE BRAIN: CHARACTER ROSTER ---
const CHARACTERS = {
    warrior: { 
        name: 'Warrior', hp: 50, max: 50, ac: 15, 
        stats: { str: 16, dex: 12, con: 14 },
        dmgDie: 8, dmgMod: 3, attacks: 1, cr: 1,
        img: 'https://image.pollinations.ai/prompt/fantasy%20warrior%20portrait%20rugged%20face%20scarred%20armor%20heroic%20lighting%201970s%20dnd%20art%20style%20oil%20painting?width=400&height=400&nologin=true&seed=99' 
    },
    rogue: { 
        name: 'Rogue', hp: 35, max: 35, ac: 14, 
        stats: { str: 10, dex: 18, con: 12 },
        dmgDie: 6, dmgMod: 4, attacks: 1, cr: 1,
        img: 'https://image.pollinations.ai/prompt/hooded%20rogue%20assassin%20shadows%20dagger%20fantasy%20art?width=400&height=400&nologin=true&seed=77' 
    },
    ogre: { 
        name: 'Ogre', hp: 59, max: 59, ac: 11, 
        stats: { str: 19, dex: 8, con: 16 },
        dmgDie: 10, dmgMod: 4, attacks: 1, cr: 2, 
        img: 'https://image.pollinations.ai/prompt/fearsome%20ogre%20portrait%20fantasy%20art%201970s%20style?width=400&height=400&nologin=true&seed=505' 
    },
    dragon: { 
        name: 'Red Dragon', hp: 110, max: 110, ac: 17, 
        stats: { str: 24, dex: 10, con: 20 },
        dmgDie: 12, dmgMod: 6, attacks: 2, cr: 5, 
        img: 'https://image.pollinations.ai/prompt/red%20dragon%20head%20roaring%20fire%20fantasy%20art%20epic?width=400&height=400&nologin=true&seed=666' 
    }
};

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
let challengerProfile = null; 
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
    }, 2500); 
}

// Updated to accept both Attack Roll and Damage Roll from client
function performAttack(attackerKey, targetKey, manualAttack = null, manualDamage = null) {
    const attacker = gameState[attackerKey];
    const target = gameState[targetKey];
    
    // 1. Determine Hit
    const d20 = manualAttack || Math.floor(Math.random() * 20) + 1;
    const hitBonus = (attacker.dmgMod || 0) + 2; 
    const hitTotal = d20 + hitBonus;
    
    const isCrit = d20 === 20;
    const isHit = isCrit || hitTotal >= target.ac;
    
    let damage = 0;
    let logMessage = '', logColor = '', logSub = '';

    if (isHit) {
        const mod = attacker.dmgMod || 0;
        
        // 2. Determine Damage
        // If client sent a damage roll (because they saw it hit), use it.
        // Otherwise (AI or auto-resolve), generate it.
        let dieResult = 0;
        if (manualDamage) {
            dieResult = manualDamage;
        } else {
            const die = attacker.dmgDie || 6;
            dieResult = Math.floor(Math.random() * die) + 1;
        }

        // Crit logic: Double the dice result if we are auto-rolling, 
        // OR simply add another roll. For simplicity with manual rolls, 
        // we assume manualDamage is the base weapon die result. 
        // If it's a crit, we add an extra auto-roll for the "crit bonus" 
        // to keep the game fast, unless we want a 3rd roll phase.
        damage = dieResult + mod;
        if (isCrit) {
            // Add extra crit die (auto-rolled for speed)
            damage += Math.floor(Math.random() * (attacker.dmgDie || 6)) + 1;
        }
        
        target.hp = Math.max(0, target.hp - damage);
        
        logMessage = isCrit ? `CRITICAL! ${attacker.name} deals ${damage}!` : `${attacker.name} hits for ${damage} damage!`;
        logColor = isCrit ? 'text-yellow-400' : 'text-red-400';
    } else {
        logMessage = `${attacker.name} missed!`;
        logColor = 'text-slate-400';
    }
    
    logSub = `Rolled ${d20} (+${hitBonus}) vs AC ${target.ac}`;

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

    socket.on('check_rejoin', () => {
        const role = players[socket.id];
        if (role && (role === 'hero' || role === 'enemy')) {
            socket.emit('welcome', { role: role, state: gameState });
        }
    });

    socket.on('join_game', (data) => {
        const requestedMode = data.mode || 'pvp';
        let charProfile;
        if (data.customProfile) {
            charProfile = data.customProfile; 
        } else {
            charProfile = { ...CHARACTERS[data.charId || 'warrior'] };
        }

        if (requestedMode === 'spectate') {
            players[socket.id] = 'spectator';
            socket.emit('welcome', { role: 'spectator', state: gameState });
        } 
        else if (requestedMode === 'pve') {
            gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
            gameState.mode = 'pve';
            gameState.hero = charProfile;
            const enemyId = data.enemyId || 'ogre';
            gameState.enemy = { ...CHARACTERS[enemyId] };

            players[socket.id] = 'hero';
            socket.emit('welcome', { role: 'hero', state: gameState });
            broadcastLobbyStats();
        }
    });

    socket.on('send_challenge', (data) => {
        activeChallenger = socket.id;
        if (data.customProfile) challengerProfile = data.customProfile;
        else challengerProfile = { ...CHARACTERS[data.charId || 'warrior'] };
        socket.broadcast.emit('challenge_received');
    });

    socket.on('accept_challenge', (data) => {
        if (!activeChallenger || !io.sockets.sockets.get(activeChallenger)) return; 
        if(resetTimeout) clearTimeout(resetTimeout);

        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        gameState.mode = 'pvp';
        players[activeChallenger] = 'hero';
        gameState.hero = challengerProfile;
        players[socket.id] = 'enemy';
        let myProfile;
        if(data.customProfile) myProfile = data.customProfile;
        else myProfile = { ...CHARACTERS[data.charId || 'warrior'] };
        gameState.enemy = myProfile;

        io.to(activeChallenger).emit('welcome', { role: 'hero', state: gameState });
        io.to(socket.id).emit('welcome', { role: 'enemy', state: gameState });
        
        activeChallenger = null;
        challengerProfile = null;
        broadcastLobbyStats();
        io.emit('game_update', { state: gameState });
    });

    // Updated Attack Listener: Accepts { roll: 18, damage: 6 }
    socket.on('attack', (data) => {
        const role = players[socket.id];
        if (role !== gameState.turn || gameState.gameOver) return;
        performAttack(role, role === 'hero' ? 'enemy' : 'hero', data?.roll, data?.damage);
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
