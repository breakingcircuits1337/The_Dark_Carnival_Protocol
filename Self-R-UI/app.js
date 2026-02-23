// ─── Socket.io Real-Time Connection ─────────────────────────────────────────
let socket;
try {
    socket = io();

    // Live swarm log → dynamic per-agent terminal windows
    socket.on('swarm-log', (data) => {
        const termGrid = document.getElementById('terminals-grid');
        let agentTerminal = document.getElementById(`terminal-${data.agent}`);

        if (!agentTerminal) {
            agentTerminal = document.createElement('div');
            agentTerminal.id = `terminal-${data.agent}`;
            agentTerminal.className = 'terminal-window';
            agentTerminal.style.cssText = 'flex:1 1 45%; min-width:300px; height:350px; overflow-y:auto; position: relative; padding-top: 2rem;';
            agentTerminal.innerHTML = `
                <div style="position: absolute; top:0; left:0; right:0; background: var(--milenko-purple); color: black; font-weight: bold; padding: 2px 10px; font-size: 0.8rem; display: flex; justify-content: space-between;">
                    <span>tmux: [${data.agent.toLowerCase()}_sess]</span>
                    <span>bash</span>
                </div>
                <div class="cursor">_</div>`;
            termGrid.appendChild(agentTerminal);
        }

        const line = document.createElement('div');
        line.className = 'log-line color-green';
        line.textContent = data.message;
        agentTerminal.insertBefore(line, agentTerminal.querySelector('.cursor'));
        agentTerminal.scrollTop = agentTerminal.scrollHeight;
        playSFX('beep');

        // Dynamically populate Swarm Commerce task list from real swarm data
        if (data.agent !== 'SwarmBuilder') return;
        const taskMatch = data.message.match(/^Started: (.+?) →/);
        const doneMatch = data.message.match(/^✓ Saved module to VAULT: (.+)/);
        const failMatch = data.message.match(/^✗ FAILED: (.+?) —/);

        if (taskMatch) addSwarmTask(taskMatch[1], 'EXECUTING');
        if (doneMatch) markSwarmTask(doneMatch[1], 'DONE');
        if (failMatch) markSwarmTask(failMatch[1], 'FAILED');
    });

    // Debate phase events → update Round Table card states
    socket.on('debate-phase', (data) => {
        const phaseMap = { 1: 'visionary', 2: 'critic', 3: 'tactician' };
        const role = phaseMap[data.phase];
        if (role) setCardState(role, data.status || 'THINKING...', 'scanning');
    });

    // Swarm done → reset UI, auto-refresh vault
    socket.on('swarm-done', (data) => {
        isDebating = false;
        initBtn.innerText = 'INITIATE DEBATE';
        ['visionary', 'critic', 'tactician'].forEach(r => setCardState(r, data.success ? 'COMPLETE' : 'ERROR', data.success ? 'idle' : 'scanning'));
        playSFX(data.success ? 'success' : 'beep');
        if (data.success) {
            playTTS('Swarm execution complete. Uploading to vault.');
            setTimeout(fetchFiles, 1000); // Auto-refresh vault
        }
    });

    socket.on('swarm-starting', () => {
        document.getElementById('review-modal').style.display = 'none';
        initBtn.innerText = 'SWARM DEPLOYED...';
    });

    // Human-in-the-loop plan review
    socket.on('plan-review-needed', (plan) => {
        playTTS('System plan verification required by human commander.');
        const modal = document.getElementById('review-modal');
        const editor = document.getElementById('plan-ui-editor');
        const feedbackInput = document.getElementById('feedback-input');
        const sugContainer = document.getElementById('plan-suggestions-container');
        const sugList = document.getElementById('plan-suggestions-list');

        // Render Suggestions
        if (plan.suggestions && plan.suggestions.length > 0) {
            sugContainer.style.display = 'block';
            sugList.innerHTML = plan.suggestions.map(s => `<li>${s.replace(/</g, '&lt;')}</li>`).join('');
        } else {
            sugContainer.style.display = 'none';
        }

        // Render Editable UI Blocks for Tasks
        editor.innerHTML = '';
        plan.tasks.forEach((t) => {
            const block = document.createElement('div');
            block.className = 'task-edit-block';
            block.style.cssText = 'border: 1px solid var(--riddle-green); padding: 10px; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 8px;';
            block.innerHTML = `
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <input type="text" class="cyber-input task-name" value="${(t.name || '').replace(/"/g, '&quot;')}" placeholder="Task Name" style="flex: 2; min-width: 150px;">
                    <input type="text" class="cyber-input task-provider" value="${t.provider || 'Mistral'}" placeholder="Provider" style="flex: 1; min-width: 100px;">
                    <input type="text" class="cyber-input task-filename" value="${(t.filename || t.command || '').replace(/"/g, '&quot;')}" placeholder="Filename / Command" style="flex: 2; min-width: 150px;">
                </div>
                <textarea class="cyber-input task-instructions" placeholder="Task Instructions" style="height: 80px; resize: vertical; width: 100%; font-family: monospace;">${(t.instructions || '').replace(/</g, '&lt;')}</textarea>
            `;
            editor.appendChild(block);
        });

        feedbackInput.value = '';
        modal.style.display = 'block';

        // Set card states to waiting
        ['visionary', 'critic', 'tactician'].forEach(r => setCardState(r, 'WAITING ON HUMAN', 'idle'));
    });

} catch (e) {
    console.warn('Socket.io not found. Using offline mode.');
}

// Modal Handlers
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('approve-plan-btn')?.addEventListener('click', () => {
        try {
            const modifiedTasks = [];
            document.querySelectorAll('.task-edit-block').forEach(block => {
                const name = block.querySelector('.task-name').value.trim();
                const provider = block.querySelector('.task-provider').value.trim();
                const filenameOrCommand = block.querySelector('.task-filename').value.trim();
                const instructions = block.querySelector('.task-instructions').value.trim();

                if (name && instructions) {
                    const task = { name, provider, instructions };
                    if (filenameOrCommand.startsWith('npm ') || filenameOrCommand.includes(' ')) {
                        task.command = filenameOrCommand;
                    } else if (filenameOrCommand) {
                        task.filename = filenameOrCommand;
                    }
                    modifiedTasks.push(task);
                }
            });

            if (modifiedTasks.length === 0) {
                alert("You cannot deploy an empty swarm. Please add at least one task.");
                return;
            }

            socket.emit('approve-plan', { tasks: modifiedTasks });
            document.getElementById('review-modal').style.display = 'none';
            playSFX('click');
        } catch (e) {
            console.error(e);
            alert("Error parsing UI blocks.");
        }
    });

    document.getElementById('reject-plan-btn')?.addEventListener('click', () => {
        socket.emit('reject-plan');
        document.getElementById('review-modal').style.display = 'none';
        isDebating = false;
        initBtn.innerText = 'INITIATE DEBATE';
        playSFX('beep');
    });

    document.getElementById('feedback-plan-btn')?.addEventListener('click', () => {
        const feedback = document.getElementById('feedback-input').value.trim();
        if (!feedback) return alert("Please type your feedback before suggesting a re-debate.");

        // Hide modal, restart debate with feedback
        document.getElementById('review-modal').style.display = 'none';

        const objInput = document.getElementById('objective-input');
        const visionary = document.getElementById('visionary-select')?.value || 'Kimi';
        const critic = document.getElementById('critic-select')?.value || 'Mistral';
        const tactician = document.getElementById('tactician-select')?.value || 'DeepSeek';

        socket.emit('trigger-debate', {
            objective: objInput?.value.trim() || 'OVERRIDE SYSTEM',
            visionary, critic, tactician,
            feedback // Pass the feedback string to trigger second-debate
        });

        ['visionary', 'critic', 'tactician'].forEach(r => setCardState(r, 'RE-DRAFTING...', 'scanning'));
        playSFX('click');
    });
});

// ─── Swarm Commerce Dynamic Task List ────────────────────────────────────────
let taskCounter = 0;
const taskIdMap = {}; // name → DOM id

function addSwarmTask(name, status) {
    taskCounter++;
    const taskList = document.getElementById('dynamic-task-list');
    const id = `task-dynamic-${taskCounter}`;
    taskIdMap[name] = id;
    const row = document.createElement('div');
    row.id = id;
    row.className = `task-row ${status === 'EXECUTING' ? 'active' : 'pending'}`;
    row.innerHTML = `
        <span class="task-id">[Task_${String(taskCounter).padStart(2, '0')}]</span>
        <span class="task-desc">${name}</span>
        <span class="task-status ${status === 'EXECUTING' ? 'ping' : ''}">${status}</span>`;
    taskList.appendChild(row);
    playSFX('beep');
}

function markSwarmTask(nameFragment, status) {
    // Match loose (filename may not be exact task name)
    for (const [name, id] of Object.entries(taskIdMap)) {
        if (nameFragment.includes(name) || name.includes(nameFragment)) {
            const row = document.getElementById(id);
            if (!row) continue;
            const statusEl = row.querySelector('.task-status');
            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = `task-status${status === 'DONE' ? ' color-green' : ' color-red'}`;
            }
            row.className = `task-row ${status === 'DONE' ? '' : 'active'}`;
        }
    }
}

// ─── Round Table Card State Updates ──────────────────────────────────────────
function setCardState(role, text, stateClass) {
    const stateEl = document.querySelector(`.card.${role} .state`);
    if (!stateEl) return;
    stateEl.textContent = text;
    stateEl.className = `state ${stateClass}`;
}

// ─── Init Button ─────────────────────────────────────────────────────────────
const initBtn = document.getElementById('init-btn');
let isDebating = false;

initBtn.addEventListener('click', () => {
    if (isDebating) return;
    playSFX('click');

    const objInput = document.getElementById('objective-input');
    const objective = objInput?.value.trim() || 'OVERRIDE SYSTEM';
    if (!objective) { objInput.value = 'OVERRIDE SYSTEM'; }

    // Read provider selections
    const visionary = document.getElementById('visionary-select')?.value || 'Kimi';
    const critic = document.getElementById('critic-select')?.value || 'Mistral';
    const tactician = document.getElementById('tactician-select')?.value || 'DeepSeek';

    isDebating = true;
    initBtn.innerText = 'DEBATE IN PROGRESS...';
    taskCounter = 0;
    Object.keys(taskIdMap).forEach(k => delete taskIdMap[k]);

    // Paint splatter effect
    const splatter = document.createElement('div');
    splatter.className = 'splatter';
    splatter.style.left = `${Math.random() * (window.innerWidth - 400) + 100}px`;
    splatter.style.top = `${Math.random() * (window.innerHeight - 400) + 100}px`;
    if (Math.random() > 0.7) splatter.style.filter = 'hue-rotate(250deg) drop-shadow(0 0 10px var(--milenko-purple))';
    document.body.appendChild(splatter);
    setTimeout(() => splatter.remove(), 600);

    // Set card states to active
    setCardState('visionary', 'DRAFTING...', 'scanning');
    setCardState('critic', 'WAITING...', 'idle');
    setCardState('tactician', 'WAITING...', 'idle');

    // Clear and reset dynamic task list
    const taskList = document.getElementById('dynamic-task-list');
    taskList.innerHTML = '';

    // Clear terminal grid and show init message with main tmux pane
    const termGrid = document.getElementById('terminals-grid');
    termGrid.innerHTML = `<div class="terminal-window" id="terminal-main" style="flex:1 1 100%; min-width:300px; height:350px; overflow-y:auto; position: relative; padding-top: 2rem;">
        <div style="position: absolute; top:0; left:0; right:0; background: var(--riddle-green); color: black; font-weight: bold; padding: 2px 10px; font-size: 0.8rem; display: flex; justify-content: space-between;">
            <span>tmux: [orchestrator_0]</span>
            <span>bash</span>
        </div>
        <div class="log-line">> Objective locked: ${objective}</div>
        <div class="log-line">> Visionary: ${visionary} | Critic: ${critic} | Tactician: ${tactician}</div>
        <div class="log-line">> Awaiting Round Table debate...</div>
        <div class="cursor">_</div>
    </div>`;

    playTTS(`Orchestrating swarm for: ${objective}`);

    if (socket) {
        socket.emit('trigger-debate', { objective, visionary, critic, tactician });
    } else {
        const err = document.createElement('div');
        err.className = 'log-line color-red';
        err.textContent = '> [SYSTEM] WebSocket offline. Cannot reach swarm backend.';
        document.getElementById('terminal-main')?.insertBefore(err, document.querySelector('#terminal-main .cursor'));
        initBtn.innerText = 'INITIATE DEBATE';
        isDebating = false;
    }
});

// ─── Self-Rewrite Button ──────────────────────────────────────────────────────
document.getElementById('self-rewrite-btn')?.addEventListener('click', async () => {
    playSFX('click');
    playTTS('Initiating self-analysis cycle.');
    const learnOut = document.getElementById('learning-output');
    learnOut.innerHTML = `<h4 style="color:var(--milenko-purple);">META-COGNITION LOG</h4>
        <div class="log-line" style="color:yellow">> Running self-analysis on Self-R source files...</div>`;

    try {
        const res = await fetch('/api/self-rewrite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objective: 'Identify and fix all critical bugs in Self-R source' })
        });
        const data = await res.json();
        const count = data.proposals?.length || 0;
        learnOut.innerHTML += `<div class="log-line color-green">> Self-analysis complete: ${count} proposals generated.</div>`;
        data.proposals?.forEach(p => {
            learnOut.innerHTML += `<div class="log-line" style="color:${p.priority === 'critical' ? 'red' : p.priority === 'high' ? 'orange' : '#fff'}">
                [${p.priority.toUpperCase()}] ${p.target_file}: ${p.issue}</div>`;
        });
        playSFX('success');
    } catch (e) {
        learnOut.innerHTML += `<div class="log-line color-red">> Self-rewrite error: ${e}</div>`;
    }
});

// ─── Web Audio SFX ───────────────────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain();
gainNode.connect(audioCtx.destination);
gainNode.gain.value = 0.1;

function playSFX(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(gainNode);
    const now = audioCtx.currentTime;
    if (type === 'click') {
        osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'beep') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'success') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// ─── TTS ─────────────────────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let cyberVoice = null;
synth.onvoiceschanged = () => {
    const voices = synth.getVoices();
    cyberVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Zira')) || voices[0];
};
function playTTS(text) {
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    if (cyberVoice) u.voice = cyberVoice;
    u.pitch = 0.7; u.rate = 1.1; u.volume = 1.0;
    synth.speak(u);
}

// ─── Local Storage: Save Provider Selections & Objective ─────────────────────
['visionary-select', 'critic-select', 'tactician-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem(id);
    if (saved) el.value = saved;
    el.addEventListener('change', () => { localStorage.setItem(id, el.value); playSFX('beep'); });
});
const objInput = document.getElementById('objective-input');
if (objInput) {
    const saved = localStorage.getItem('objective');
    if (saved) objInput.value = saved;
    objInput.addEventListener('input', () => localStorage.setItem('objective', objInput.value));
}

// ─── Drag & Drop Modules ─────────────────────────────────────────────────────
const dashboard = document.querySelector('.dashboard');
document.querySelectorAll('.module').forEach(mod => {
    mod.setAttribute('draggable', true);
    mod.addEventListener('dragstart', e => { mod.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; playSFX('click'); });
    mod.addEventListener('dragend', () => mod.classList.remove('dragging'));
});
dashboard.addEventListener('dragover', e => {
    e.preventDefault();
    const after = getDragAfterElement(dashboard, e.clientY);
    const dragging = document.querySelector('.dragging');
    if (dragging) after ? dashboard.insertBefore(dragging, after) : dashboard.appendChild(dragging);
});
function getDragAfterElement(container, y) {
    return [...container.querySelectorAll('.module:not(.dragging)')].reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ─── Expandable Task Rows ─────────────────────────────────────────────────────
document.addEventListener('click', e => {
    const row = e.target.closest('.task-row');
    if (!row) return;
    const isExpanded = row.classList.contains('expanded');
    document.querySelectorAll('.task-row').forEach(r => {
        r.classList.remove('expanded');
        const d = r.querySelector('.task-detail');
        if (d) d.style.display = 'none';
    });
    if (!isExpanded) {
        row.classList.add('expanded');
        let detail = row.querySelector('.task-detail');
        if (!detail) {
            detail = document.createElement('div');
            detail.className = 'task-detail';
            detail.innerHTML = `> UIM subroutine: ${row.querySelector('.task-desc')?.textContent}<br>> Injecting skill context payload...<br>> Awaiting SwarmBuilder Promise resolution...`;
            row.appendChild(detail);
        }
        detail.style.display = 'block';
        playSFX('beep');
    }
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

// ─── Audio-Reactive Equalizer ─────────────────────────────────────────────────
const canvas = document.getElementById('equalizer');
const ctx = canvas.getContext('2d');
const numBars = 20;
const barWidth = canvas.width / numBars - 2;

function drawEqualizer() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < numBars; i++) {
        const barHeight = (isDebating ? 20 : 5) + Math.random() * (isDebating ? 10 : 5);
        const x = i * (canvas.width / numBars);
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#BF00FF');
        gradient.addColorStop(1, '#39FF14');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    }
    setTimeout(() => requestAnimationFrame(drawEqualizer), 50);
}
drawEqualizer();

// ─── Completions Vault ────────────────────────────────────────────────────────
async function fetchFiles() {
    try {
        const res = await fetch('/api/completions');
        const data = await res.json();
        const list = document.getElementById('file-list');
        list.innerHTML = '';
        if (!data.files.length) {
            list.innerHTML = '<li style="color:red">> Vault is empty.</li>';
            return;
        }
        data.files.forEach(f => {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:0.5rem;';
            li.innerHTML = `
                <span style="color:var(--milenko-purple)">${f}</span>
                <div style="display:flex;gap:5px;">
                    <a href="/api/completions/${f}" target="_blank" class="hatchet-btn" style="padding:2px 10px;font-size:0.7rem;text-decoration:none;">VIEW</a>
                    <button onclick="analyzeFile('${f}')" class="hatchet-btn" style="padding:2px 10px;font-size:0.7rem;background:var(--milenko-purple);border-color:var(--milenko-purple);">LEARN</button>
                    <button onclick="deleteFile('${f}')" class="hatchet-btn" style="padding:2px 10px;font-size:0.7rem;background:darkred;border-color:red;">DEL</button>
                </div>`;
            list.appendChild(li);
        });
    } catch (e) { console.error(e); }
}

async function analyzeFile(filename) {
    const learnOut = document.getElementById('learning-output');
    learnOut.innerHTML = `<h4 style="color:var(--milenko-purple);">META-COGNITION LOG</h4>
        <div class="log-line" style="color:yellow">> Ingesting ${filename}...</div>`;
    playSFX('click');
    playTTS(`Applying meta cognitive engine to ${filename}`);
    try {
        const fileRes = await fetch('/api/completions/' + filename);
        const contents = await fileRes.text();
        const res = await fetch('/api/learn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, contents })
        });
        const data = await res.json();
        learnOut.innerHTML += `<div class="log-line color-green" style="white-space:pre-wrap;">${data.analysis}</div>`;
        playSFX('success');
    } catch (e) {
        learnOut.innerHTML += `<div class="log-line color-red">> Error: ${e}</div>`;
    }
}

async function deleteFile(filename) {
    try {
        await fetch('/api/completions/' + filename, { method: 'DELETE' });
        playSFX('click');
        fetchFiles();
    } catch (e) { console.error(e); }
}

setTimeout(fetchFiles, 1000);
