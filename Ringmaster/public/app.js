let ws;
const nodeGrid = document.getElementById('node-grid');
const logFeed = document.getElementById('log-feed');
const input = document.getElementById('master-input');
const count = document.getElementById('node-count');

function appendLog(nodeId, text, color = '#aaa') {
    const d = new Date();
    const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = 'log-line';
    div.innerHTML = `<span class="log-time">[${t}]</span> <span style="color:${color}">[${nodeId}]</span> ${text}`;
    logFeed.appendChild(div);
    logFeed.scrollTop = logFeed.scrollHeight;
}

function updateNodes(nodes) {
    nodeGrid.innerHTML = '';
    count.innerText = nodes.length;

    nodes.forEach(n => {
        let color = '--milenko-purple';
        if (n.role === 'OSINT') color = '--riddle-green';
        if (n.role === 'MEDIA') color = '--wraith-red';

        const card = document.createElement('div');
        card.className = 'node-card';
        card.setAttribute('data-status', n.status);

        card.innerHTML = `
            <div class="node-header">
                <span class="node-id" style="color: var(${color})">${n.id}</span>
                <span class="node-role">${n.role}</span>
            </div>
            <div class="node-body">
                <div>URL: ${n.url}</div>
                <div>LOBE ACTIVE</div>
            </div>
            <div class="node-status" style="${n.status === 'ERROR' ? 'color: red;' : ''}">
                > ${n.status}
            </div>
        `;

        if (n.status === 'AWAITING HUMAN') {
            const btn = document.createElement('button');
            btn.className = 'intervene-btn';
            btn.innerText = '[ 👁 INTERVENE ]';
            btn.addEventListener('click', () => { window.open(`${n.url}`, '_blank'); });
            card.appendChild(btn);
        }

        nodeGrid.appendChild(card);
    });
}

function connect() {
    ws = new WebSocket(`ws://${window.location.host}/ws`);
    ws.onopen = () => { appendLog('SYSTEM', 'Connected to the CARNIVAL GROUNDS.', '#0f0'); };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'node_update') { updateNodes(data.nodes); }
        if (data.type === 'terminal_log') {
            appendLog(data.node_id, data.log);
            if (typeof playSFX === 'function') playSFX('beep');
        }
    };

    ws.onclose = (e) => {
        appendLog('SYSTEM', 'Connection lost! Reconnecting to the Ringmaster...', '#f00');
        setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
    };
}

connect();

// ─── Vault Functions ──────────────────────────────────────────────────────────
async function fetchVault() {
    const fileList = document.getElementById('file-list');
    const learningOutput = document.getElementById('learning-output');
    if (!fileList) return;
    fileList.innerHTML = '<li style="opacity:0.5;">> Scanning wagons...</li>';
    try {
        const res = await fetch('/api/vault');
        const data = await res.json();
        const files = data.vault || [];
        fileList.innerHTML = '';
        if (files.length === 0) {
            fileList.innerHTML = '<li style="opacity:0.5;">> No completions found in any Wagon.</li>';
            return;
        }
        files.forEach(f => {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.78rem;';
            if (f.error) {
                li.innerHTML = `<span style="opacity:0.4;">[${f.node_id}] ERROR: ${f.error}</span>`;
            } else {
                li.innerHTML = `
                    <span style="color:var(--milenko-purple);font-size:0.7rem;white-space:nowrap;">[${f.node_id}]</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.filename}">${f.filename}</span>
                    <button onclick="analyzeVaultFile('${f.node_id}','${f.filename}')" style="background:transparent;border:1px solid var(--riddle-green);color:var(--riddle-green);font-family:'Share Tech Mono',monospace;font-size:0.7rem;padding:2px 6px;cursor:pointer;">INGEST</button>
                    <button onclick="deleteVaultFile('${f.node_id}','${f.filename}')" style="background:transparent;border:1px solid var(--wraith-red);color:var(--wraith-red);font-family:'Share Tech Mono',monospace;font-size:0.7rem;padding:2px 6px;cursor:pointer;">DEL</button>
                `;
            }
            fileList.appendChild(li);
        });
        if (learningOutput) {
            const line = document.createElement('div');
            line.className = 'log-line';
            line.style.color = 'var(--riddle-green)';
            line.textContent = `> Vault refreshed. ${files.length} completion(s) found across ${new Set(files.map(f => f.node_id)).size} wagon(s).`;
            learningOutput.appendChild(line);
            learningOutput.scrollTop = learningOutput.scrollHeight;
        }
    } catch (e) {
        fileList.innerHTML = `<li style="color:var(--wraith-red);">> Vault fetch error: ${e}</li>`;
    }
}

async function analyzeVaultFile(nodeId, filename) {
    const learningOutput = document.getElementById('learning-output');
    if (learningOutput) {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.style.color = 'var(--milenko-purple)';
        line.textContent = `> Ingesting ${filename} from [${nodeId}]...`;
        learningOutput.appendChild(line);
        learningOutput.scrollTop = learningOutput.scrollHeight;
    }
    if (typeof playSFX === 'function') playSFX('click');
    try {
        // Fetch the file contents first
        const contentsRes = await fetch(`http://${nodeId.replace('LXC-', '').split('-')[0]}:${nodeId.split('-')[1]}/api/completions/${filename}`);
        const contents = await contentsRes.text();
        // Send to learn endpoint
        const res = await fetch(`/api/vault/${nodeId}/learn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, contents })
        });
        const data = await res.json();
        if (learningOutput) {
            const div = document.createElement('div');
            div.className = 'log-line';
            div.style.cssText = 'color:#fff;margin-top:0.5rem;white-space:pre-wrap;word-break:break-word;';
            div.innerHTML = `<span style="color:var(--riddle-green);">> COGNITION RESULT [${filename}]:</span>\n${data.analysis || data.error || JSON.stringify(data)}`;
            learningOutput.appendChild(div);
            learningOutput.scrollTop = learningOutput.scrollHeight;
        }
        if (typeof playSFX === 'function') playSFX('success');
    } catch (e) {
        if (learningOutput) {
            const line = document.createElement('div');
            line.className = 'log-line';
            line.style.color = 'var(--wraith-red)';
            line.textContent = `> Ingest error: ${e}`;
            learningOutput.appendChild(line);
        }
    }
}

async function deleteVaultFile(nodeId, filename) {
    try {
        await fetch(`/api/vault/${nodeId}/${filename}`, { method: 'DELETE' });
        if (typeof playSFX === 'function') playSFX('beep');
        fetchVault(); // Refresh
    } catch (e) {
        console.error('Delete failed:', e);
    }
}

// Wire up the Vault REFRESH button
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.files-panel button').forEach(btn => {
        if (btn.textContent.trim() === 'REFRESH') {
            btn.onclick = fetchVault;
        }
    });
    // Auto-load vault on page start
    fetchVault();
});


input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;
        input.value = '';
        executeGlobalEvent(val);
    }
});

const initBtn = document.getElementById('init-btn');
if (initBtn) {
    initBtn.addEventListener('click', () => {
        if (typeof playSFX === 'function') playSFX('click');
        const val = input.value.trim();
        if (!val) {
            input.focus();
            return;
        }
        input.value = '';
        executeGlobalEvent(val);
    });
}

async function executeGlobalEvent(val) {
    appendLog('USER', `> ${val}`, '#fff');

    // Logic routing based on the `/role` flag
    let payload = { objective: val };

    if (val.startsWith('/osint ')) {
        payload = { objective: val.replace('/osint ', ''), role_target: 'OSINT' };
    } else if (val.startsWith('/media ')) {
        payload = { objective: val.replace('/media ', ''), role_target: 'MEDIA' };
    } else if (val.startsWith('/core ')) {
        payload = { objective: val.replace('/core ', ''), role_target: 'CORE' };
    }

    // Read provider selections from Neural Carnival
    const vis = document.getElementById('visionary-select')?.value || 'Kimi';
    const crit = document.getElementById('critic-select')?.value || 'Mistral';
    const tact = document.getElementById('tactician-select')?.value || 'DeepSeek';

    payload.visionary = vis;
    payload.critic = crit;
    payload.tactician = tact;

    // Visual feedback
    const splatter = document.createElement('div');
    splatter.className = 'splatter';
    splatter.style.left = `${Math.random() * (window.innerWidth - 400) + 100}px`;
    splatter.style.top = `${Math.random() * (window.innerHeight - 400) + 100}px`;
    if (Math.random() > 0.7) splatter.style.filter = 'hue-rotate(250deg) drop-shadow(0 0 10px var(--milenko-purple))';
    document.body.appendChild(splatter);
    setTimeout(() => splatter.remove(), 600);

    setCardState('visionary', 'DRAFTING...', 'scanning');
    setCardState('critic', 'WAITING...', 'idle');
    setCardState('tactician', 'WAITING...', 'idle');

    try {
        const res = await fetch('/api/swarm/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) appendLog('SYS-ERR', data.error, '#f00');
        else appendLog('ROUTER', `Signal locked. Relaying directly to ${data.target}...`, 'cyan');
    } catch (err) {
        appendLog('HTTP-ERR', err.toString(), '#f00');
    }
}

function setCardState(role, text, stateClass) {
    const stateEl = document.querySelector(`.card.${role} .state`);
    if (!stateEl) return;
    stateEl.textContent = text;
    stateEl.className = `state ${stateClass}`;
}

// ─── Local Storage: Save Provider Selections ─────────────────────
['visionary-select', 'critic-select', 'tactician-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem(id);
    if (saved) el.value = saved;
    el.addEventListener('change', () => {
        localStorage.setItem(id, el.value);
        if (typeof playSFX === 'function') playSFX('beep');
    });
});

// ─── 3D Card Tilt ─────────────────────────────────────────────────────────────
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const tiltX = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -15;
        const tiltY = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 15;
        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02,1.02,1.02)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    });
});

// ─── Web Audio SFX & Ambient Static ──────────────────────────────────────────
let audioCtx;
let ambientGain;
let sfxGain;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // SFX Gain Node
    sfxGain = audioCtx.createGain();
    sfxGain.connect(audioCtx.destination);
    sfxGain.gain.value = 0.15;

    // Ambient Static Noise Generator
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds of noise
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // Pure White Noise
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Deep LPF to make the static rumble in the background like dark machinery
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400; // Deep rumble

    // LFO to make the static pulse/breathe
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5; // Slow pulse

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 200; // Sweep frequency by 200Hz

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.08; // Volume of the background static

    whiteNoise.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);

    whiteNoise.start();
}

// Browsers require a gesture to start audio
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

function playSFX(type) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(sfxGain);
    const now = audioCtx.currentTime;

    if (type === 'click') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}
