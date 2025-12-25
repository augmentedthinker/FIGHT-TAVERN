const { useState, useEffect, useRef, useLayoutEffect } = React;
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- INTRO APP ---
const STORY_STEPS = [
    { id: 'opening', src: '', color: 'from-black to-zinc-900', title: "Greetings", narration: "Greetings, traveler. You’ve wandered far to find this seat by my hearth. Let us pull back the veil and reveal the game we are about to play." },
    { id: 'dm-visible', src: 'DMmagic.png', color: 'from-purple-900 to-indigo-900', title: "The Voice in the Dark", narration: "I am your Dungeon Master, the architect of your triumphs and the grinning devil on your shoulder. I weave the \"invisible architecture\" of this journey, ensuring that every choice you make has a profound consequence." },
    { id: 'the-map', src: 'map.png', color: 'from-amber-900 to-orange-900', title: "The Eye of the Storm", narration: "Look upon the map. Haven’s Keep is the center. It is the \"safe harbor\" in a sea of chaos, and it is exactly where your story begins." },
    { id: 'dice-table', src: 'dice.png', color: 'from-blue-900 to-slate-900', title: "The Engines of Fate", narration: "To navigate this world, you must master these Tools of Fate. These many-sided dice determine how hard you hit or how deep the world bites back." },
    { id: 'd20-squirrels', src: 'dice20.png', color: 'from-emerald-900 to-teal-900', title: "The Die of Destiny", narration: "But this—the d20—is the most important object in your universe. It decides if you meet the Difficulty Class (DC) required to stay alive." },
    { id: 'dm-fading', src: 'DMswirls.png', color: 'from-gray-900 to-black', title: "The Threshold of Haven", narration: "You stumble through the dark, the air tasting of ozone and wet earth, until the silhouette of Haven’s Keep looms out of the deluge like a jagged tooth. You are at your breaking point." }
];

function ImageWithFallback({ src, fallbackColor }) {
    const [error, setError] = useState(false);
    if (error || !src) return <div className={`w-full h-full bg-gradient-to-br ${fallbackColor}`} />;
    return <img src={src} alt="" className="w-full h-full object-cover" onError={() => setError(true)} />;
}

function IntroApp() {
    const [progress, setProgress] = useState(0);
    const [isPortrait, setIsPortrait] = useState(false);
    
    useEffect(() => {
        const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
        check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check);
    }, []);

    const handleWheel = (e) => {
        if(isPortrait) return;
        setProgress(prev => Math.min(Math.max(prev + e.deltaY * 0.002, 0), STORY_STEPS.length - 1));
    };

    const snapToNearest = (idx) => setProgress(idx);

    return (
        <div className="fixed inset-0 bg-black overflow-hidden font-serif select-none" onWheel={handleWheel}>
            {isPortrait && <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-8 text-amber-500 font-pirata text-2xl text-center">Rotate Device to Begin</div>}
            
            {!isPortrait && (
                <div className="absolute inset-0 w-full h-full">
                    {STORY_STEPS.map((step, index) => {
                        const rel = progress - index;
                        if (rel < -1 || rel > 1) return null;
                        
                        const imgOpacity = 1 - Math.abs(rel);
                        const scale = 1 + (rel * 0.2);
                        const isCurrent = Math.round(progress) === index;
                        
                        return (
                            <div key={step.id} className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none">
                                <div className="relative w-full h-full" style={{ opacity: imgOpacity, transform: `scale(${scale})` }}>
                                    <ImageWithFallback src={step.src} fallbackColor={step.color} />
                                </div>
                                
                                {/* Content Block */}
                                {isCurrent && (
                                    <div className="absolute bottom-0 left-0 right-0 p-8 pb-16 bg-gradient-to-t from-black via-black/80 to-transparent text-center">
                                        <div className="max-w-4xl mx-auto space-y-4 animate-pop">
                                            <h2 className="text-4xl md:text-6xl text-amber-500 font-pirata drop-shadow-lg">{step.title}</h2>
                                            <p className="text-xl md:text-2xl text-gray-200 font-serif leading-relaxed text-justify">{step.narration}</p>
                                            {step.id === 'opening' && (
                                                <div className="pt-6 pointer-events-auto">
                                                    <button 
                                                        onClick={() => window.toggleFightModal()} 
                                                        className="px-4 py-2 border-2 border-red-500 text-red-500 font-pirata text-xl hover:bg-red-900/50 rounded transition-all"
                                                    >
                                                        ⚔ Enter Battle Arena (Test)
                                                    </button>
                                                </div>
                                            )}
                                            {step.id === 'dm-fading' && (
                                                <div className="pt-6 pointer-events-auto">
                                                    <button onClick={window.transitionIntroToGate} className="btn-enter-gate animate-pulse">Approach the Gates</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto">
                        {STORY_STEPS.map((_, i) => (
                            <button key={i} onClick={() => snapToNearest(i)} className={`w-3 h-3 rounded-full border-2 ${Math.round(progress)===i ? 'bg-amber-500 border-amber-500' : 'border-white/50'}`} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- GATE APP WITH DICE ---
function DiceWidget({ onRollComplete, onClose }) {
    const containerRef = useRef(null);
    const rollBtnRef = useRef(null);
    const resultDisplayRef = useRef(null);
    const ctx = useRef({ isRolling: false });

    useLayoutEffect(() => {
        if(!containerRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f9);
        const camera = new THREE.PerspectiveCamera(35, width/height, 0.1, 100);
        camera.position.set(0, 18, 9);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        containerRef.current.appendChild(renderer.domElement);

        const world = new CANNON.World();
        world.gravity.set(0, -50, 0);
        const mat = new CANNON.Material();
        world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.3, restitution: 0.5 }));

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(5, 12, 5);
        sun.castShadow = true;
        scene.add(sun);

        const groundBody = new CANNON.Body({ mass: 0, material: mat });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
        world.addBody(groundBody);

        const addWall = (x, z, ry) => {
            const b = new CANNON.Body({ mass: 0, material: mat });
            b.addShape(new CANNON.Box(new CANNON.Vec3(10, 10, 1)));
            b.position.set(x, 10, z); b.quaternion.setFromEuler(0, ry, 0);
            world.addBody(b);
        };
        addWall(0, -3.5, 0); addWall(0, 3.5, 0); addWall(-5, 0, Math.PI/2); addWall(5, 0, Math.PI/2);

        const geo = new THREE.IcosahedronGeometry(1.5);
        const dieMesh = new THREE.Group();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3b82f6, flatShading: true }));
        mesh.castShadow = true; dieMesh.add(mesh);

        const pos = geo.attributes.position;
        const vertices = [], faces = [], logicalFaces = [];
        for(let i=0; i<pos.count; i++) vertices.push(new CANNON.Vec3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        for(let i=0; i<pos.count; i+=3) faces.push([i, i+1, i+2]);

        for(let i=0; i<pos.count; i+=3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, i);
            const b = new THREE.Vector3().fromBufferAttribute(pos, i+1);
            const c = new THREE.Vector3().fromBufferAttribute(pos, i+2);
            const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(c,b), new THREE.Vector3().subVectors(a,b)).normalize();
            if(!logicalFaces.find(lf => lf.normal.dot(n) > 0.99)) {
                const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
                const ctx2d = canvas.getContext('2d'); ctx2d.fillStyle='white'; ctx2d.font='bold 40px Arial'; ctx2d.textAlign='center'; ctx2d.textBaseline='middle';
                ctx2d.fillText(logicalFaces.length+1, 32, 32);
                const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent:true, polygonOffset:true, polygonOffsetFactor:-1 }));
                const center = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1/3);
                p.position.copy(center).add(n.clone().multiplyScalar(0.01)); p.lookAt(center.clone().add(n));
                dieMesh.add(p);
                logicalFaces.push({ normal: n, value: logicalFaces.length + 1 });
            }
        }

        const body = new CANNON.Body({ mass: 5, shape: new CANNON.ConvexPolyhedron({ vertices, faces }), material: mat });
        body.position.set(0, 4, 0); world.addBody(body); scene.add(dieMesh);

        ctx.current = { scene, world, body, dieMesh, logicalFaces, renderer, isRolling: false };

        let animId;
        const animate = () => {
            world.step(1/60);
            dieMesh.position.copy(body.position); dieMesh.quaternion.copy(body.quaternion);
            renderer.render(scene, camera);
            animId = requestAnimationFrame(animate);
        };
        animate();

        return () => { 
            cancelAnimationFrame(animId); 
            if(renderer.domElement && containerRef.current) containerRef.current.removeChild(renderer.domElement);
            renderer.dispose(); 
        };
    }, []);

    const roll = () => {
        const c = ctx.current; if(c.isRolling) return;
        c.isRolling = true; rollBtnRef.current.disabled = true;
        resultDisplayRef.current.classList.remove('visible');
        c.body.position.set(0, 6, 0);
        c.body.applyImpulse(new CANNON.Vec3((Math.random()-.5)*15, -10, (Math.random()-.5)*15), new CANNON.Vec3(0,0,0));
        c.body.angularVelocity.set(Math.random()*25, Math.random()*25, Math.random()*25);

        const check = setInterval(() => {
            if(c.body.velocity.length() < 0.1 && c.body.angularVelocity.length() < 0.1) {
                clearInterval(check);
                const q = new THREE.Quaternion().copy(c.body.quaternion);
                let best = -Infinity, res = 1;
                c.logicalFaces.forEach(f => {
                    const d = f.normal.clone().applyQuaternion(q).dot(new THREE.Vector3(0,1,0));
                    if(d > best) { best = d; res = f.value; }
                });
                resultDisplayRef.current.innerText = res; resultDisplayRef.current.classList.add('visible');
                c.isRolling = false; rollBtnRef.current.disabled = false;
                setTimeout(() => onRollComplete(res), 1200);
            }
        }, 100);
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="dice-widget-container">
                <div id="widget-ui">
                    <div className="text-center pb-2 border-b border-black/5">
                        <span className="text-[0.7rem] uppercase font-bold tracking-widest text-slate-500">Polyhedral Engine</span>
                        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400">✕</button>
                    </div>
                    <div id="result-display" ref={resultDisplayRef}>20</div>
                    <div className="controls-area">
                        <div className="flex justify-between bg-black/5 p-1 rounded-lg">
                            {['D4','D6','D8','D10','D12','D20'].map(d => (
                                <span key={d} className={`text-[0.65rem] font-bold p-1 px-2 rounded ${d==='D20'?'bg-white text-blue-600 shadow-sm':'text-slate-400'}`}>{d}</span>
                            ))}
                        </div>
                        <button id="roll-btn" ref={rollBtnRef} onClick={roll}>Cast the Die</button>
                    </div>
                </div>
                <div ref={containerRef} className="w-full h-full"></div>
            </div>
        </div>
    );
}

function GateApp() {
    const [gameState, setGameState] = useState('intro');
    const [mode, setMode] = useState('normal');
    const [rolls, setRolls] = useState([]);
    const [showDice, setShowDice] = useState(false);

    const narrative = {
        intro: "The iron-bound gates of Haven’s Keep stand before you, locked tight against the blizzard. Your body is failing; this is your final chance to find warmth. The DC is 10.",
        progress: `The first stone reveals ${rolls[0]}. One more roll to determine your fate under ${mode}.`,
        success: "Victory! With a final result strong enough to move the bars, you heave the gates open. The warmth of the keep spills out, saving you from the storm.",
        fail: "Defeat. The die settles on a number too low to matter. Your strength gives out, the gates remain shut, and the cold embraces you one last time."
    };

    const handleRoll = (res) => {
        const nextRolls = [...rolls, res]; setRolls(nextRolls);
        if (mode === 'normal' || nextRolls.length === 2) {
            const final = mode === 'advantage' ? Math.max(...nextRolls) : mode === 'disadvantage' ? Math.min(...nextRolls) : nextRolls[0];
            setGameState(final >= 10 ? 'success' : 'fail'); setShowDice(false);
        } else {
            setGameState('progress'); setShowDice(false);
            setTimeout(() => setShowDice(true), 500);
        }
    };

    return (
        <div className="h-full w-full flex items-center justify-center p-4">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scroll p-4 md:p-8 space-y-8 text-center">
                <h1 className="text-4xl md:text-7xl font-pirata text-amber-500 tracking-wider uppercase text-shadow-heavy drop-shadow-xl">
                    {gameState === 'success' ? 'Sanctuary Found' : gameState === 'fail' ? 'Frozen Fate' : 'The Final Threshold'}
                </h1>
                <p className="text-xl md:text-2xl text-gray-100 leading-relaxed font-serif min-h-[60px] pb-6 text-shadow-heavy max-w-2xl mx-auto">{narrative[gameState]}</p>

                {gameState === 'intro' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                        {[
                            { id:'advantage', t:'Advantage', desc:'Roll twice. Keep Highest.', colors:'from-emerald-900/90 to-emerald-950/90 border-emerald-500/50 text-emerald-400', icon: '▲' },
                            { id:'normal', t:'Normal', desc:'Roll once. Trust fate.', colors:'from-indigo-900/90 to-indigo-950/90 border-indigo-500/50 text-indigo-400', icon: '●' },
                            { id:'disadvantage', t:'Disadvantage', desc:'Roll twice. Keep Lowest.', colors:'from-red-900/90 to-red-950/90 border-red-500/50 text-red-400', icon: '▼' }
                        ].map(opt => (
                            <button key={opt.id} onClick={() => { setMode(opt.id); setRolls([]); setShowDice(true); }} className={`relative p-4 md:p-6 rounded-2xl border-2 shadow-xl bg-gradient-to-br ${opt.colors} hover:scale-105 transition-all`}>
                                <div className="text-3xl mb-2">{opt.icon}</div>
                                <h3 className="font-pirata text-2xl tracking-wide">{opt.t}</h3>
                                <p className="text-sm font-bold mt-1">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                )}

                {rolls.length > 0 && (
                    <div className="flex justify-center gap-8 py-4 items-center">
                        {rolls.map((r, i) => {
                            const isFinished = gameState === 'success' || gameState === 'fail';
                            let isDiscarded = false, isChosen = false;
                            if (isFinished) {
                                if (rolls.length > 1) {
                                    isDiscarded = mode === 'advantage' ? r < Math.max(...rolls) : r > Math.min(...rolls);
                                    isChosen = !isDiscarded;
                                } else isChosen = true;
                            }
                            return (
                                <div key={i} className={`relative flex items-center justify-center transition-all duration-500 ${isDiscarded ? 'opacity-60 scale-90 grayscale' : ''} ${isChosen && isFinished ? 'scale-110 drop-shadow' : ''}`}>
                                    <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center text-3xl font-pirata bg-black/40 ${r>=10?'border-emerald-500 text-emerald-400':'border-red-500 text-red-400'}`}>{r}</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {gameState === 'success' && (
                    <button onClick={window.transitionGateToTavern} className="w-full max-w-md mx-auto block text-amber-500 font-pirata text-3xl uppercase tracking-widest mt-4 border-2 border-amber-500/50 bg-black/60 backdrop-blur p-3 rounded-xl hover:bg-black/80 hover:border-amber-400 shadow-xl animate-pulse">
                        Open the Gates
                    </button>
                )}
                {gameState === 'fail' && (
                    <button onClick={() => setGameState('intro')} className="w-full max-w-md mx-auto block text-red-500 font-pirata text-3xl uppercase tracking-widest mt-4 border-2 border-amber-500/50 bg-black/60 backdrop-blur p-3 rounded-xl hover:bg-black/80 hover:border-red-400 shadow-xl">
                        ↻ Try Again
                    </button>
                )}
            </div>
            {showDice && <DiceWidget onRollComplete={handleRoll} onClose={() => setShowDice(false)} />}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<IntroApp />);

const gateRoot = ReactDOM.createRoot(document.getElementById('gate-root'));
gateRoot.render(<GateApp />);