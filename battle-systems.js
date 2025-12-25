// --- MULTIPLAYER BATTLE SYSTEM ---
const RAILWAY_URL = "https://fight-tavern-production.up.railway.app";
let socket = null;
window.isMultiplayerActive = false; 
window.isServerOffline = false;     

if (typeof io !== 'undefined') {
    socket = io(RAILWAY_URL);
    socket.on('connect', () => {
        window.isServerOffline = false;
        refreshHubButton();
    });
    socket.on('connect_error', () => {
        window.isServerOffline = true;
        window.isMultiplayerActive = false;
        refreshHubButton();
    });
} else {
    window.isServerOffline = true;
}

const IMAGES = {
    warrior: "https://image.pollinations.ai/prompt/fantasy%20warrior%20portrait%20rugged%20face%20scarred%20armor%20heroic%20lighting%201970s%20dnd%20art%20style%20oil%20painting?width=400&height=400&nologin=true&seed=99",
    ogre: "https://image.pollinations.ai/prompt/fearsome%20ogre%20portrait%20fantasy%20art%201970s%20style?width=400&height=400&nologin=true&seed=505",
};

window.app = {
    openGame(mode) {
        if (!socket) return;
        battle.init();
        if(mode === 'challenge') {
            socket.emit('send_challenge');
            document.getElementById('challenge-btn').innerText = "CHALLENGING...";
            document.getElementById('challenge-btn').disabled = true;
        } else {
            socket.emit('join_game', { mode: mode });
            document.getElementById('lobby-panel').classList.add('hidden');
            document.getElementById('game-widget').classList.remove('hidden');
        }
    },
    acceptChallenge() {
        if (!socket) return;
        battle.init(); 
        socket.emit('accept_challenge');
        document.getElementById('challenge-modal').classList.add('hidden');
        document.getElementById('lobby-panel').classList.add('hidden');
        document.getElementById('game-widget').classList.remove('hidden');
    },
    closeWidget() {
        document.getElementById('game-widget').classList.add('hidden');
        document.getElementById('lobby-panel').classList.remove('hidden');
        const challengeBtn = document.getElementById('challenge-btn');
        if(challengeBtn) {
            challengeBtn.innerText = "SEND CHALLENGE";
            challengeBtn.disabled = false;
            challengeBtn.innerHTML = '<i data-lucide="swords" class="w-5 h-5"></i> SEND CHALLENGE';
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

function refreshHubButton() {
    const imgElement = document.getElementById('scene-image');
    if (imgElement && imgElement.src.includes('Tavern.png') && document.getElementById('choice-grid').style.display !== 'none') {
        window.loadScene('hub'); 
    }
}

if (socket) {
    socket.on('lobby_stats', (stats) => {
        const statusText = document.getElementById('lobby-status-text');
        const actionsDiv = document.getElementById('lobby-actions');
        const countText = document.getElementById('lobby-count');
        if (stats.connected > 1) window.isMultiplayerActive = true;
        else window.isMultiplayerActive = false;
        if(!countText) return;
        countText.innerText = `${stats.connected} Patrons in the Tavern`;
        let actionHtml = '';
        if (stats.gameInProgress) {
            socket.emit('check_rejoin');
            statusText.innerText = "Battle in Progress!";
            statusText.className = "text-lg text-red-400 font-bold animate-pulse";
            actionHtml = `<button onclick="app.openGame('spectate')" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 border border-slate-600"><i data-lucide="eye" class="w-4 h-4"></i> Watch Battle</button>`;
        } 
        else if (stats.connected > 1) {
            statusText.innerText = "Opponent Available!";
            statusText.className = "text-lg text-yellow-400 font-bold";
            actionHtml = `
                <button id="challenge-btn" onclick="app.openGame('challenge')" class="w-full bg-yellow-600 hover:bg-yellow-500 text-white py-4 rounded-lg font-bold flex items-center justify-center gap-2 border border-yellow-400 shadow-lg shadow-yellow-900/20"><i data-lucide="swords" class="w-5 h-5"></i> SEND CHALLENGE</button>
                <div class="text-center text-xs text-slate-500 mt-2">or</div>
                <button onclick="app.openGame('pve')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 border border-slate-700 mt-2"><i data-lucide="bot" class="w-4 h-4"></i> Practice vs CPU</button>
            `;
        } 
        else {
            statusText.innerText = "You are Alone...";
            statusText.className = "text-lg text-slate-400 font-bold";
            actionHtml = `
                <button onclick="app.openGame('pve')" class="w-full bg-blue-900 hover:bg-blue-800 text-blue-100 py-4 rounded-lg font-bold flex items-center justify-center gap-2 border border-blue-700 shadow-lg shadow-blue-900/20"><i data-lucide="bot" class="w-5 h-5"></i> PLAY VS COMPUTER</button>
                <div class="text-xs text-slate-500 mt-2">Waiting for another human...</div>
            `;
        }
        actionsDiv.innerHTML = actionHtml;
        if (window.lucide) window.lucide.createIcons();
    });
    socket.on('challenge_received', () => {
        const modal = document.getElementById('challenge-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    });
    socket.on('challenge_canceled', () => {
        const modal = document.getElementById('challenge-modal');
        if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    });
}

window.battle = {
    myRole: null, isMyTurn: false,
    init() {
        document.getElementById('hero-img').src = IMAGES.warrior;
        document.getElementById('enemy-img').src = IMAGES.ogre;
        if (window.lucide) window.lucide.createIcons();
        this.setupSocket();
        if (socket) socket.emit('check_rejoin');
    },
    setupSocket() {
        if (!socket) return;
        socket.off('welcome'); socket.off('game_update'); socket.off('chat_message'); socket.off('player_left');
        socket.on('welcome', (data) => {
            this.myRole = data.role;
            if (this.myRole === 'hero' || this.myRole === 'enemy') {
                document.getElementById('lobby-panel').classList.add('hidden');
                document.getElementById('game-widget').classList.remove('hidden');
                document.getElementById('challenge-modal').classList.add('hidden');
                document.getElementById('challenge-modal').classList.remove('flex');
            }
            const alert = document.getElementById('role-alert');
            if(this.myRole === 'hero') alert.innerText = "You: Warrior";
            else if(this.myRole === 'enemy') alert.innerText = "You: Ogre";
            else alert.innerText = "Spectating";
            this.updateUI(data.state);
        });
        socket.on('game_update', (data) => {
            this.updateUI(data.state);
            if(data.action) this.handleAction(data.action);
        });
        socket.on('player_left', (data) => {
            const ov = document.getElementById('overlay');
            ov.classList.remove('hidden');
            document.getElementById('overlay-title').innerText = "OPPONENT LEFT";
            document.getElementById('overlay-sub').innerText = "The battle is cancelled.";
            const btn = document.getElementById('overlay-btn');
            btn.innerText = "BACK TO LOBBY";
            btn.onclick = () => { ov.classList.add('hidden'); app.closeWidget(); };
        });
        socket.on('chat_message', (data) => {
            const box = document.getElementById('chat-messages');
            const color = data.role === 'hero' ? 'text-blue-400' : (data.role === 'enemy' ? 'text-red-400' : 'text-slate-500');
            const name = data.role === 'hero' ? 'WAR' : (data.role === 'enemy' ? 'OGR' : (data.role === 'bot' ? 'CPU' : 'SPEC'));
            const el = document.createElement('div');
            el.innerHTML = `<span class="font-bold ${color} text-[10px] mr-1 uppercase tracking-wide">${name}</span><span class="text-slate-300 text-xs">${data.text}</span>`;
            box.appendChild(el);
            box.scrollTop = box.scrollHeight;
        });
    },
    sendAttack() {
        if(!this.isMyTurn || !socket) return;
        document.getElementById('d20-btn').classList.add('rolling');
        socket.emit('attack');
    },
    sendChat(e) {
        e.preventDefault();
        if (!socket) return;
        const input = document.getElementById('chat-input');
        if(input.value.trim()) { socket.emit('send_chat', input.value.trim()); input.value = ''; }
    },
    resetGame() { if(socket) socket.emit('reset_game'); },
    updateUI(state) {
        const setStats = (id, cur, max) => {
            document.getElementById(id + '-hp-text').innerText = `${cur}/${max}`;
            const pct = (cur/max)*100;
            document.getElementById(id + '-bar').style.width = `${pct}%`;
            setTimeout(() => document.getElementById(id + '-chip').style.width = `${pct}%`, 500);
        };
        setStats('hero', state.hero.hp, state.hero.max);
        setStats('enemy', state.enemy.hp, state.enemy.max);
        if(state.gameOver) {
            const ov = document.getElementById('overlay');
            ov.classList.remove('hidden');
            document.getElementById('overlay-title').innerText = state.hero.hp > 0 ? "VICTORY" : "DEFEAT";
            document.getElementById('overlay-sub').innerText = state.hero.hp > 0 ? "The Warrior prevails!" : "The Ogre feasts!";
            const btn = document.getElementById('overlay-btn');
            btn.innerText = "PLAY AGAIN";
            btn.onclick = () => battle.resetGame();
            return;
        } else if (document.getElementById('overlay-title').innerText !== "OPPONENT LEFT") {
            document.getElementById('overlay').classList.add('hidden');
        }
        this.isMyTurn = (this.myRole === state.turn);
        const btn = document.getElementById('d20-btn');
        const dieBg = document.getElementById('die-bg');
        const dieText = document.getElementById('die-text');
        btn.classList.remove('rolling');
        const heroCard = document.getElementById('hero-card');
        const enemyCard = document.getElementById('enemy-card');
        if(state.turn === 'hero') {
            heroCard.classList.add('active-turn'); heroCard.classList.remove('inactive-turn');
            enemyCard.classList.remove('active-turn'); enemyCard.classList.add('inactive-turn');
        } else {
            enemyCard.classList.add('active-turn'); enemyCard.classList.remove('inactive-turn');
            heroCard.classList.remove('active-turn'); heroCard.classList.add('inactive-turn');
        }
        if(this.isMyTurn) {
            btn.classList.remove('die-disabled');
            dieBg.classList.replace('fill-slate-800', 'fill-red-900');
            dieBg.classList.replace('stroke-slate-600', 'stroke-red-500');
            dieText.classList.replace('fill-slate-500', 'fill-white');
            document.getElementById('action-log').innerText = "YOUR TURN";
            document.getElementById('action-log').className = "text-sm font-bold text-yellow-400 animate-pulse";
        } else {
            btn.classList.add('die-disabled');
            dieBg.classList.replace('fill-red-900', 'fill-slate-800');
            dieBg.classList.replace('stroke-red-500', 'stroke-slate-600');
            dieText.classList.replace('fill-white', 'fill-slate-500');
            const who = state.turn === 'hero' ? "Warrior" : "Ogre";
            document.getElementById('action-log').innerText = `${who} attacking...`;
            document.getElementById('action-log').className = "text-sm font-bold text-slate-500";
        }
    },
    handleAction(action) {
        document.getElementById('action-log').innerText = action.log.msg;
        document.getElementById('action-log').className = `text-sm font-bold ${action.log.color}`;
        document.getElementById('math-log').innerText = action.log.sub || "";
        const targetId = action.attacker === 'hero' ? 'enemy-card' : 'hero-card';
        const card = document.getElementById(targetId);
        if(action.isHit) {
            const img = card.querySelector('img');
            img.style.filter = "sepia(1) hue-rotate(-50deg) saturate(5)";
            setTimeout(() => img.style.filter = "", 200);
            card.classList.add('animate-shake');
            setTimeout(() => card.classList.remove('animate-shake'), 500);
        }
    }
};

window.toggleFightModal = function() {
    const modal = document.getElementById('fight-modal');
    if(modal.classList.contains('active')) { modal.classList.remove('active'); }
    else { modal.classList.add('active'); if (window.lucide) window.lucide.createIcons(); }
}