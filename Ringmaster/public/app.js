const ws = new WebSocket(`ws://${window.location.host}/ws`);
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
            card.innerHTML += `<button style="margin-top:10px; width:100%; padding:8px; background:transparent; border:1px solid var(--wraith-red); color:var(--wraith-red); cursor:pointer;">[ 👁 INTERVENE ]</button>`;

            // Allow clicking the intervene button to switch to that node's UI
            card.querySelector('button').addEventListener('click', () => {
                window.open(`${n.url}`, '_blank');
            });
        }

        nodeGrid.appendChild(card);
    });
}

ws.onopen = () => { appendLog('SYSTEM', 'Connected to the MESH-NET.', '#0f0'); };

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'node_update') { updateNodes(data.nodes); }
    if (data.type === 'terminal_log') { appendLog(data.node_id, data.log); }
};

input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;
        input.value = '';

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
});
