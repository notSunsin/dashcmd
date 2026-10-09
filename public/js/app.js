// ===== app.js — wiring UI + WebSocket + polling =====
import { floatMessage, setAgentScreen, setTour, setOrbit } from './scene.js';

const $ = (id) => document.getElementById(id);

// jam + greeting
setInterval(() => {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('id-ID');
  const h = d.getHours();
  $('greetText').textContent = `Selamat ${h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 19 ? 'sore' : 'malam'}, Rizky!`;
}, 1000);

// --- stats polling ---
async function refreshStats() {
  try {
    const s = await (await fetch('/api/stats')).json();
    $('mCpu').textContent = `${s.cpu}%`;
    $('bCpu').style.width = `${s.cpu}%`;
    $('mRam').textContent = `${s.mem.usedMB}/${s.mem.totalMB} MB (${Math.round(s.mem.usedMB / s.mem.totalMB * 100)}%)`;
    $('bRam').style.width = `${Math.round(s.mem.usedMB / s.mem.totalMB * 100)}%`;
    $('mDisk').textContent = `${s.disk.usedGB}/${s.disk.totalGB} GB (${Math.round(s.disk.usedGB / s.disk.totalGB * 100)}%)`;
    $('bDisk').style.width = `${Math.round(s.disk.usedGB / s.disk.totalGB * 100)}%`;
    $('mNet').textContent = `${fmtBytes(s.net.rx)}/s ↓ · ${fmtBytes(s.net.tx)}/s ↑`;
    const u = s.uptime;
    $('mUp').textContent = `${Math.floor(u / 3600)}j ${Math.floor(u % 3600 / 60)}m`;
  } catch {}
}
const fmtBytes = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B';
refreshStats(); setInterval(refreshStats, 4000);

// --- agents ---
async function refreshAgents() {
  try {
    const list = await (await fetch('/api/agents')).json();
    const team = $('teamList'); team.innerHTML = '';
    const sel = $('toAgent'); sel.innerHTML = '';
    let online = 0;
    for (const a of list) {
      if (a.online) online++;
      const div = document.createElement('div');
      div.className = 'agent ' + (a.online ? (a.status !== 'idle' ? 'busy' : 'up') : '');
      div.innerHTML = `<span class="dot"></span><div class="meta">
        <div class="name">${a.name}${a.online ? '' : ' · offline'}</div>
        <div class="act">${a.online ? (a.activity || a.status) : 'menunggu bridge…'}</div></div>`;
      team.appendChild(div);
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      sel.appendChild(opt);
      setAgentScreen(a.id, a.online ? (a.status !== 'idle' ? 'thinking' : 'idle') : 'offline');
    }
    $('stTeam').textContent = `${online}/${list.length}`;
  } catch {}
}
refreshAgents(); setInterval(refreshAgents, 8000);

// --- feed pesan ---
let msgCount = 0;
function addFeed(m) {
  msgCount++;
  $('stMsg').textContent = msgCount;
  const div = document.createElement('div');
  div.className = 'msg';
  const time = new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `<span class="who">${m.from}</span><span class="arrow">→</span><span class="to">${m.to}</span>
    <span class="body">${escapeHtml(m.body)}</span><time style="margin-left:auto;color:#4d5c7a;font-size:11px">${time}</time>`;
  const feed = $('feed');
  feed.appendChild(div);
  while (feed.children.length > 60) feed.removeChild(feed.firstChild);
  floatMessage(m.from);
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadHistory() {
  try {
    const list = await (await fetch('/api/messages')).json();
    for (const m of list.slice(-30)) addFeed(m);
  } catch {}
}
loadHistory();

// --- kirim pesan manual dari dashboard ---
$('btnSend').addEventListener('click', async () => {
  const to = $('toAgent').value, body = $('msgBody').value.trim();
  if (!body) return;
  await fetch('/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'rizky', to, body }),
  });
  $('msgBody').value = '';
});
$('msgBody').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('btnSend').click(); }
});

// --- tombol stage ---
$('btnTour').addEventListener('click', (e) => {
  const on = e.target.classList.toggle('on');
  setTour(on);
});
$('btnOrbit').addEventListener('click', (e) => {
  const on = e.target.classList.toggle('on');
  setOrbit(on);
});

// --- WebSocket realtime ---
let lastSeq = 0;
function connectWS() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const { type, payload } = JSON.parse(ev.data);
    if (type === 'hello') { lastSeq = payload.seq; refreshAgents(); }
    if (type === 'message' && payload.seq > lastSeq) { lastSeq = payload.seq; addFeed(payload); }
    if (type === 'agent') refreshAgents();
  };
  ws.onclose = () => setTimeout(connectWS, 3000);
}
connectWS();
