const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- GAME CONFIGURATION ---
const INITIAL_STATE = {
    hero: { hp: 50, max: 50, ac: 15, name: 'Warrior', dmgDie: 8, dmgMod: 2 },
    enemy: { hp: 45, max: 45, ac: 12, name: 'Ogre', dmgDie: 6, dmgMod: 2 },
    turn: 'hero', // 'hero' or 'enemy'
    gameOver: false,
    logs: [] // Store last few logs
};

// Deep copy to reset game
let gameState = JSON.parse(JSON.stringify(INITIAL_STATE));

// Track connected sockets: { socketId: 'hero' | 'enemy' | 'spectator' }
let players = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Assign Role
    let role = 'spectator';
    if (!Object.values(players).includes('hero')) {
        role = 'hero';
    } else if (!Object.values(players).includes('enemy')) {
        role = 'enemy';
    }
    players[socket.id] = role;

    // Send the user their role and current state
    socket.emit('welcome', { role, state: gameState });
    
    // Tell everyone a new player joined (optional, mainly for debugging)
    io.emit('player_joined', { role, id: socket.id });

    // 2. Handle Attack Action
    socket.on('attack', () => {
        // Validation: Is it this player's turn?
        if (role !== gameState.turn) return;
        if (gameState.gameOver) return;

        // Perform the Turn Logic
        const attackerKey = role;
        const targetKey = role === 'hero' ? 'enemy' : 'hero';
        
        const attacker = gameState[attackerKey];
        const target = gameState[targetKey];

        // Roll D20
        const d20 = Math.floor(Math.random() * 20) + 1;
        const hitTotal = d20 + 3; // Hardcoded +3 Attack Bonus for simplicity
        const isHit = d20 === 20 || hitTotal >= target.ac;
        const isCrit = d20 === 20;

        let damage = 0;
        let logMessage = '';
        let logColor = '';

        if (isHit) {
            // Roll Damage
            damage = Math.floor(Math.random() * attacker.dmgDie) + 1 + attacker.dmgMod;
            if (isCrit) damage += Math.floor(Math.random() * attacker.dmgDie) + 1; // Crit adds extra die

            // Apply Damage
            target.hp = Math.max(0, target.hp - damage);
            
            logMessage = `${attacker.name} hits for ${damage} damage!`;
            logColor = 'text-red-400';
        } else {
            logMessage = `${attacker.name} missed! (Rolled ${d20})`;
            logColor = 'text-slate-400';
        }

        // Check Win Condition
        if (target.hp <= 0) {
            gameState.gameOver = true;
            logMessage = `${target.name} was defeated!`;
            logColor = 'text-yellow-400';
        } else {
            // Switch Turn
            gameState.turn = targetKey;
        }

        // Broadcast update to EVERYONE
        io.emit('game_update', {
            state: gameState,
            action: {
                attacker: attackerKey,
                roll: d20,
                damage: damage,
                isHit: isHit,
                isCrit: isCrit,
                log: { msg: logMessage, color: logColor }
            }
        });
    });

    // 3. Handle Reset
    socket.on('reset_game', () => {
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE));
        io.emit('game_update', { state: gameState, reset: true });
    });

    // 4. Handle Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        // Optional: Reset game if a player leaves?
        // For now, we just let the slot open up for someone else.
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
