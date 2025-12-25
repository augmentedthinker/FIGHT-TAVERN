// --- TRANSITION UTILS (Must be global for React to access) ---
window.transitionIntroToGate = () => {
    document.getElementById('root').classList.remove('active');
    setTimeout(() => {
        document.getElementById('gate-root').classList.add('active');
        window.dispatchEvent(new Event('resize'));
    }, 500);
};

window.transitionGateToTavern = () => {
    document.getElementById('gate-root').classList.remove('active');
    setTimeout(() => {
        loadScene('exterior');
        const sanctuary = document.getElementById('sanctuary-wrapper');
        sanctuary.classList.add('active');
        window.dispatchEvent(new Event('resize'));
    }, 500);
};

// --- PART 0: TITLE SCREEN UTILS ---
window.startGame = function() {
    document.getElementById('title-screen').classList.add('hidden-title');
    setTimeout(() => {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('root').classList.add('active');
    }, 1000);
}

window.saveGame = function() {
    const saveData = {
        stats: characterStats,
        quests: questLog,
        flags: gameStateFlags,
        memories: questMemories,
        log: document.getElementById('story-log').innerHTML,
        scene: currentSceneKey || 'hub'
    };
    localStorage.setItem('roomStew_saveData', JSON.stringify(saveData));
    const btn = document.getElementById('save-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" style="color:#4ade80; width:24px; height:24px;"></i>';
    if(window.lucide) window.lucide.createIcons();
    setTimeout(() => { btn.innerHTML = originalHtml; if(window.lucide) window.lucide.createIcons(); }, 1500);
}

window.loadGame = function() {
    const raw = localStorage.getItem('roomStew_saveData');
    if(!raw) { alert("No save game found!"); return; }
    const data = JSON.parse(raw);
    
    // Restore State
    Object.assign(characterStats, data.stats);
    Object.assign(questLog, data.quests);
    Object.assign(gameStateFlags, data.flags);
    Object.assign(questMemories, data.memories);
    
    // Restore UI
    document.getElementById('story-log').innerHTML = data.log;
    updateGoldUI();
    const uiStats = { STR: document.getElementById('str-val'), DEX: document.getElementById('dex-val'), INT: document.getElementById('int-val'), CHA: document.getElementById('cha-val') };
    for(let s of ['STR','DEX','INT','CHA']) {
        const val = characterStats[s];
        const mod = Math.floor((val-10)/2);
        uiStats[s].innerHTML = `${val} <span class="stat-mod">(${mod>=0?'+':''}${mod})</span>`;
    }

    // Hide Title, Show Tavern
    document.getElementById('title-screen').classList.add('hidden-title');
    setTimeout(() => {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('sanctuary-wrapper').classList.add('active');
        loadScene(data.scene || 'hub');
    }, 1000);
}

// --- PART 3: TAVERN LOGIC ---
const characterStats = { STR: 0, DEX: 0, INT: 0, CHA: 0, GOLD: 5 };
const questLog = { bartho: 'pending', elara: 'pending', table: 'pending', stranger: 'pending' };
const questMemories = { bartho: null, elara: null, table: null, stranger: null };
const gameStateFlags = { hasRoom: false, hasEaten: false };

let activeStat = null;
let statRolls = []; 
let isGeneratingStat = false;
let isSkillCheck = false;
let activeDC = 10;
let activeSuccessScene = '';
let activeFailScene = '';
let activeQuestKey = '';
let currentSceneKey = 'hub'; // Tracks current location for saving

// UI Elements (Cached after load)
let imgElement, titleElement, choiceGrid, backBtn, diceModal, dialogueArea, dialogueText, journalModal, storyLog, uiStats;

document.addEventListener('DOMContentLoaded', () => {
    imgElement = document.getElementById('scene-image');
    titleElement = document.getElementById('scene-title');
    choiceGrid = document.getElementById('choice-grid');
    backBtn = document.getElementById('controls-left');
    diceModal = document.getElementById('dice-modal-overlay');
    dialogueArea = document.getElementById('dialogue-area');
    dialogueText = document.getElementById('dialogue-text');
    journalModal = document.getElementById('journal-modal');
    storyLog = document.getElementById('story-log');
    uiStats = { STR: document.getElementById('str-val'), DEX: document.getElementById('dex-val'), INT: document.getElementById('int-val'), CHA: document.getElementById('cha-val') };
    
    // Initial Load
    loadScene('hub');
    addToStory("You arrived at The Weary Traveler after surviving the storm.");
});

window.updateGoldUI = function() {
    document.getElementById('gold-val').innerText = characterStats.GOLD;
}

window.buyRoom = function() {
    if(characterStats.GOLD >= 2) {
        characterStats.GOLD -= 2;
        gameStateFlags.hasRoom = true;
        updateGoldUI();
        addToStory("Rented a room for the night. (Cost: 2 Gold)");
        loadScene('bartho'); // Refresh dialogue
    }
}

window.buyStew = function() {
    if(characterStats.GOLD >= 1) {
        characterStats.GOLD -= 1;
        gameStateFlags.hasEaten = true;
        updateGoldUI();
        addToStory("Ate a hearty warm stew. (Cost: 1 Gold)");
        loadScene('elara'); // Refresh dialogue
    }
}

window.finishGame = function() {
    const ov = document.getElementById('overlay');
    ov.classList.remove('hidden');
    const icon = document.getElementById('overlay-icon');
    if (icon) icon.setAttribute('data-lucide', 'bed-double');
    document.getElementById('overlay-title').innerText = "REST AT LAST";
    document.getElementById('overlay-sub').innerText = "You have weathered the storm, filled your belly, and found a safe bed. The night is yours.";
    const btn = document.getElementById('overlay-btn');
    btn.innerText = "THE END";
    btn.onclick = () => location.reload();
    if (window.lucide) window.lucide.createIcons();
}

window.triggerAIChat = async function(npcKey) {
    const npcMap = { 'bartho': 'Bartho the Innkeeper', 'elara': 'Elara the Barmaid', 'table': 'A group of rowdy farmers', 'stranger': 'A mysterious cloaked stranger' };
    const name = npcMap[npcKey];
    const dialogueText = document.getElementById('dialogue-text');
    dialogueText.innerHTML = `<span style="color:#aaa; font-style:italic;">${name} is thinking...</span>`;
    const prompt = `Roleplay as ${name} in a fantasy tavern. Respond to the player in character. Keep it under 2 sentences. Seed: ${Math.random()}`; 
    try {
        const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
        if (response.ok) { const text = await response.text(); dialogueText.innerText = `"${text}"`; }
        else { dialogueText.innerText = "The spirits are silent."; }
    } catch (e) { dialogueText.innerText = "The spirits are silent."; }
}

window.generateMemory = function(npc, isSuccess) {
    const style = "dark fantasy visual novel art style, digital painting, atmospheric, cinematic lighting, detailed, masterpiece";
    let desc = "";
    if (npc === 'bartho') desc = isSuccess ? `strong warrior lifting keg in tavern, ${style}` : `shattered keg in tavern, ${style}`;
    else if (npc === 'elara') desc = isSuccess ? `catching falling mugs heroically, ${style}` : `broken mugs on floor, ${style}`;
    else if (npc === 'table') desc = isSuccess ? `bard singing to crowd, ${style}` : `angry farmers booing, ${style}`;
    else if (npc === 'stranger') desc = isSuccess ? `winning chess move, ${style}` : `chess defeat, ${style}`;
    if (desc) {
        const seed = Math.floor(Math.random() * 10000);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(desc)}?width=1024&height=1024&seed=${seed}&nologo=true`;
        questMemories[npc] = url;
        new Image().src = url;
    }
}

window.showMemory = function(npc) {
    const url = questMemories[npc];
    if (!url) return;
    document.getElementById('memory-img').src = url;
    document.getElementById('memory-modal').classList.add('active');
}

window.closeMemory = function() { document.getElementById('memory-modal').classList.remove('active'); }

// --- SCENE DEFINITIONS ---
const scenes = {
    'exterior': { 
        title: "The Flickering Sign", image: "TavernNight.png", 
        dialogue: "The storm howls behind you, but the warm glow of the tavern offers a promise of safety.",
        choices: [ { text: "Enter the Tavern", action: "loadScene('hub')" } ] 
    },
    'hub': { 
        title: "The Weary Traveler", image: "Tavern.png", isHub: true, 
        choices: [ 
            { text: "Talk to Bartho", action: "loadScene('bartho')" }, 
            { text: "Speak with Elara", action: "loadScene('elara')" }, 
            { text: "Entertain Crowd", action: "loadScene('table')" }, 
            { text: "Observe Stranger", action: "loadScene('stranger')" }, 
            { text: "Go to Room", action: "loadScene('room')" },
            { 
                text: () => {
                    if (window.isServerOffline) return "Battle Arena (Offline)";
                    if (window.isMultiplayerActive) return "LIVE BATTLE (Join)";
                    return "Enter Battle Arena";
                }, 
                action: "toggleFightModal()", 
                class: () => {
                    if (window.isServerOffline) return "btn-choice offline-btn";
                    if (window.isMultiplayerActive) return "btn-choice live-battle";
                    return "btn-choice battle-btn";
                }
            }
        ] 
    },
    // BARTHO (BARTENDER)
    'bartho': { 
        title: "The Innkeeper", image: "Bartender.png", isHub: false, 
        dialogue: () => {
            if (gameStateFlags.hasRoom) return "Bartho nods at you. 'Room's upstairs. Sleep well, traveler.'";
            if (questLog.bartho === 'success') return "Bartho nods respectfully. 'Strongest arm I've seen in weeks.'";
            if (questLog.bartho === 'fail') return "Bartho wipes the counter. 'Mind your feet, butterfingers.'";
            return "The burly innkeeper grunts. 'New here? Move this keg for me if you want a drink.'";
        },
        choices: [ 
            { text: "Rent Room (2 Gold)", condition: ()=> !gameStateFlags.hasRoom && characterStats.GOLD >= 2, action: "buyRoom()", class: "gold-btn" },
            { text: "I'll do it (Roll STR)", condition: ()=>questLog.bartho==='pending'&&characterStats.STR===0, action: "startStatTest('STR','bartho_post_stat')" }, 
            { text: "Lift Keg", condition: ()=>questLog.bartho==='pending'&&characterStats.STR>0, action: "loadScene('bartho_post_stat')" }, 
            { text: "Recall Memory", condition: () => questMemories.bartho, action: "showMemory('bartho')", class: "mem-btn" },
            { text: "Chat (AI)", action: "triggerAIChat('bartho')", class: "ai-btn" },
            { text: "Leave", action: "loadScene('hub')" } 
        ] 
    },
    'bartho_post_stat': { title: "The Challenge", image: "Bartender.png", dialogue: "The keg is heavy, smelling of old oak.", choices: [ { text: "Heave! (DC 12)", action: "startSkillCheck('STR', 12, 'bartho_win', 'bartho_lose', 'bartho')" } ] },
    'bartho_win': { title: "Success!", image: "Bartender.png", dialogue: "You lifted it with a grunt of power!", choices: [ { text: "Drink Ale", action: "loadScene('hub')" } ] },
    'bartho_lose': { title: "Failure...", image: "Bartender.png", dialogue: "It slips from your hands and rolls away.", choices: [ { text: "Walk away", action: "loadScene('hub')" } ] },
    
    // ELARA (BARMAID)
    'elara': { 
        title: "The Hearth", image: "Barmaid.png", isHub: false, 
        dialogue: () => {
            if (gameStateFlags.hasEaten) return "Elara smiles. 'Hope the stew warmed your bones.'";
            if (questLog.elara === 'success') return "Elara beams. 'My hero! You saved me a week's wages.'";
            if (questLog.elara === 'fail') return "Elara sweeps up glass. 'Please... just watch your step.'";
            return "Elara stumbles nearby, a tray of mugs tipping dangerously!";
        },
        choices: [ 
            { text: "Buy Stew (1 Gold)", condition: ()=> !gameStateFlags.hasEaten && characterStats.GOLD >= 1, action: "buyStew()", class: "gold-btn" },
            { text: "Catch Tray (Roll DEX)", condition: ()=>questLog.elara==='pending'&&characterStats.DEX===0, action: "startStatTest('DEX','elara_post_stat')" }, 
            { text: "Catch", condition: ()=>questLog.elara==='pending'&&characterStats.DEX>0, action: "loadScene('elara_post_stat')" }, 
            { text: "Recall Memory", condition: () => questMemories.elara, action: "showMemory('elara')", class: "mem-btn" },
            { text: "Chat (AI)", action: "triggerAIChat('elara')", class: "ai-btn" },
            { text: "Leave", action: "loadScene('hub')" } 
        ] 
    },
    'elara_post_stat': { title: "Reflex Test", image: "Barmaid.png", dialogue: "Mugs flying everywhere.", choices: [ { text: "Snatch! (DC 13)", action: "startSkillCheck('DEX', 13, 'elara_win', 'elara_lose', 'elara')" } ] },
    'elara_win': { title: "Incredible!", image: "Barmaid.png", dialogue: "You caught them mid-air!", choices: [ { text: "Welcome", action: "loadScene('hub')" } ] },
    'elara_lose': { title: "Crash!", image: "Barmaid.png", dialogue: "Shattered glass everywhere.", choices: [ { text: "Leave", action: "loadScene('hub')" } ] },

    // TABLE
    'table': { 
        title: "The Common Room", image: "Table.png", 
        dialogue: () => {
            if (questLog.table === 'success') return "The farmers cheer. 'Sing us another!'";
            if (questLog.table === 'fail') return "They mutter. 'Here comes the screecher.'";
            return "A table of farmers looks bored. They need entertainment.";
        },
        choices: [ 
            { text: "Tell Tale (Roll CHA)", condition: ()=>questLog.table==='pending'&&characterStats.CHA===0, action: "startStatTest('CHA','table_post_stat')" }, 
            { text: "Sing", condition: ()=>questLog.table==='pending'&&characterStats.CHA>0, action: "loadScene('table_post_stat')" }, 
            { text: "Recall Memory", condition: () => questMemories.table, action: "showMemory('table')", class: "mem-btn" },
            { text: "Chat (AI)", action: "triggerAIChat('table')", class: "ai-btn" },
            { text: "Leave", action: "loadScene('hub')" } 
        ] 
    },
    'table_post_stat': { title: "Performance", image: "Table.png", dialogue: "You jump on a bench and sing.", choices: [ { text: "Sing loud! (DC 12)", action: "startSkillCheck('CHA', 12, 'table_win', 'table_lose', 'table')" } ] },
    'table_win': { title: "Applause!", image: "Table.png", dialogue: "The room erupts in cheers.", choices: [ { text: "Bow", action: "loadScene('hub')" } ] },
    'table_lose': { title: "Boos", image: "Table.png", dialogue: "Someone throws a cabbage.", choices: [ { text: "Leave", action: "loadScene('hub')" } ] },

    // STRANGER
    'stranger': { 
        title: "The Stranger", image: "Stranger.png", 
        dialogue: () => {
            if (questLog.stranger === 'success') return "The Stranger nods. 'A sharp mind you have.'";
            if (questLog.stranger === 'fail') return "The figure ignores you.";
            return "A cloaked figure sits at a chessboard. 'Do you play?'";
        },
        choices: [ 
            { text: "Play (Roll INT)", condition: ()=>questLog.stranger==='pending'&&characterStats.INT===0, action: "startStatTest('INT','stranger_post_stat')" }, 
            { text: "Play", condition: ()=>questLog.stranger==='pending'&&characterStats.INT>0, action: "loadScene('stranger_post_stat')" }, 
            { text: "Recall Memory", condition: () => questMemories.stranger, action: "showMemory('stranger')", class: "mem-btn" },
            { text: "Chat (AI)", action: "triggerAIChat('stranger')", class: "ai-btn" },
            { text: "Leave", action: "loadScene('hub')" } 
        ] 
    },
    'stranger_post_stat': { title: "Gambit", image: "Stranger.png", dialogue: "A complex strategy unfolds.", choices: [ { text: "Win (DC 13)", action: "startSkillCheck('INT', 13, 'stranger_win', 'stranger_lose', 'stranger')" } ] },
    'stranger_win': { title: "Checkmate", image: "Stranger.png", dialogue: "The stranger tips their king.", choices: [ { text: "Take coin", action: "loadScene('hub')" } ] },
    'stranger_lose': { title: "Defeat", image: "Stranger.png", dialogue: "You walked into a trap.", choices: [ { text: "Leave", action: "loadScene('hub')" } ] },

    'room': { 
        title: "Quarters", 
        image: "Room.png", 
        dialogue: () => {
            if (!gameStateFlags.hasRoom) return "The heavy oak door is locked. You need to rent a room from Bartho before you can enter.";
            if (!gameStateFlags.hasEaten) return "The bed looks inviting, but your stomach twists with hunger. You can't sleep on an empty stomach.";
            return "The fire is warm, the bed is soft, and your belly is full. You have survived the storm.";
        },
        choices: [ 
            { text: "Sleep & Finish Game", condition: () => gameStateFlags.hasRoom && gameStateFlags.hasEaten, action: "finishGame()", class: "sleep-btn" },
            { text: "Return to Common Room", action: "loadScene('hub')" } 
        ] 
    }
};

window.loadScene = function(sceneKey) {
    currentSceneKey = sceneKey; // Track scene for saving
    const data = scenes[sceneKey];
    imgElement.classList.remove('visible');
    backBtn.classList.remove('active');
    choiceGrid.style.opacity = '0'; choiceGrid.style.pointerEvents = 'none';
    dialogueArea.style.display = 'none';
    setTimeout(() => {
        imgElement.src = data.image;
        titleElement.innerText = data.title;
        choiceGrid.innerHTML = '';
        if(data.choices) {
            data.choices.forEach(c => {
                if (c.condition && !c.condition()) return;
                const b = document.createElement('button');
                b.className = 'btn-choice';
                let cssClass = typeof c.class === 'function' ? c.class() : (c.class || '');
                if (cssClass) b.className += ' ' + cssClass;
                b.innerText = typeof c.text === 'function' ? c.text() : c.text;
                b.setAttribute('onclick', c.action);
                choiceGrid.appendChild(b);
            });
        }
        const onReady = () => {
            imgElement.classList.add('visible');
            setTimeout(() => {
                titleElement.style.opacity = '1';
                if(data.dialogue) { dialogueText.innerText = typeof data.dialogue === 'function' ? data.dialogue() : data.dialogue; dialogueArea.style.display = 'block'; }
                choiceGrid.style.display = 'flex';
                setTimeout(() => { choiceGrid.style.opacity = '1'; choiceGrid.style.pointerEvents = 'auto'; }, 50);
                if (!data.isHub) backBtn.classList.add('active'); else backBtn.classList.remove('active');
            }, 300);
        };
        if (imgElement.complete) onReady(); else { imgElement.onload = onReady; imgElement.onerror = onReady; }
    }, 800);
}

window.toggleDiceModal = function() { 
    if (diceModal.classList.contains('active')) { diceModal.classList.remove('active'); restoreDiceUI(); } 
    else diceModal.classList.add('active'); 
}
window.toggleJournal = function() { journalModal.classList.toggle('active'); }
window.addToStory = function(text) { const div = document.createElement('div'); div.className = 'journal-entry'; div.innerText = text; storyLog.appendChild(div); }

function restrictDiceUI(allowed) { document.querySelectorAll('.die-btn').forEach(b => { if(parseInt(b.dataset.sides) === allowed) { b.classList.remove('display-none'); b.click(); } else { b.classList.add('display-none'); } }); }
function restoreDiceUI() { document.querySelectorAll('.die-btn').forEach(b => b.classList.remove('display-none')); }

window.startStatTest = function(stat, next) { if(characterStats[stat]>0) return; activeStat=stat; pendingNextScene=next; isGeneratingStat=true; statRolls=[]; toggleDiceModal(); restrictDiceUI(6); document.querySelector('.dice-title').innerText = `Generating ${stat} (1/3)`; }
window.startSkillCheck = function(stat, dc, win, lose, key) { isSkillCheck=true; activeStat=stat; activeDC=dc; activeSuccessScene=win; activeFailScene=lose; activeQuestKey=key; toggleDiceModal(); restrictDiceUI(20); const mod = Math.floor((characterStats[stat]-10)/2); document.querySelector('.dice-title').innerText = `Check: ${stat} ${mod>=0?'+':''}${mod} (DC ${dc})`; }

window.handleDiceResult = function(result) {
    if(isGeneratingStat && activeStat) {
        statRolls.push(result);
        if(statRolls.length < 3) { setTimeout(() => document.querySelector('.dice-title').innerText = `Generating ${activeStat} (${statRolls.length+1}/3)`, 1000); }
        else {
            const total = statRolls.reduce((a,b)=>a+b,0);
            characterStats[activeStat] = total;
            const mod = Math.floor((total-10)/2);
            uiStats[activeStat].innerHTML = `${total} <span class="stat-mod">(${mod>=0?'+':''}${mod})</span>`;
            document.querySelector('.dice-title').innerText = `${activeStat} Set to ${total}`;
            isGeneratingStat = false;
            addToStory(`Your ${activeStat} is ${total}.`);
            setTimeout(() => { toggleDiceModal(); restoreDiceUI(); activeStat=null; loadScene(pendingNextScene); }, 1500);
        }
    } else if(isSkillCheck && activeStat) {
        const mod = Math.floor((characterStats[activeStat]-10)/2);
        const total = result+mod;
        const success = total>=activeDC;
        document.querySelector('.dice-title').innerText = `${success?"Success!":"Failure..."} (${result}${mod>=0?'+':''}${mod}=${total} vs DC ${activeDC})`;
        if(activeQuestKey) { questLog[activeQuestKey] = success?'success':'fail'; generateMemory(activeQuestKey, success); }
        setTimeout(() => { toggleDiceModal(); restoreDiceUI(); isSkillCheck=false; activeStat=null; loadScene(success ? activeSuccessScene : activeFailScene); addToStory(success ? `Success on ${activeQuestKey} quest.` : `Failed ${activeQuestKey} quest.`); }, 2500);
    }
};