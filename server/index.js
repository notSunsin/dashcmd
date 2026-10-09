/**
 * Vela Command Center — backend
 *
 * - REST API untuk pesan antar-agent (inbox/outbox)
 * - Polling endpoint: agent cek pesan tiap 15 detik
 * - WebSocket: push realtime ke dashboard 3D
 * - Stats endpoint: CPU/RAM/Disk/uptime (mirip panel "Server & layanan")
 * - Agent heartbeat registry
 */
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.VCC_DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.VCC_PORT || 8787);

fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'messages.json');

// ---------- store ----------
let db = { messages: [], agents: {}, seq: 0 };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
}
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// default agents (2 Vela profiles)
const DEFAULT_AGENTS = ['vela-one', 'vela-two'];
for (const a of DEFAULT_AGENTS) {
  if (!db.agents[a]) {
    db.agents[a] = { id: a, name: a, online: false, lastSeen: 0, activity: '', status: 'idle' };
  }
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

// ----- agents -----
app.get('/api/agents', (_req, res) => {
  res.json(Object.values(db.agents).map((a) => ({
    ...a,
    online: Date.now() - a.lastSeen < 45_000,
  })));
});

app.post('/api/agents/:id/heartbeat', (req, res) => {
  const a = db.agents[req.params.id] || (db.agents[req.params.id] = { id: req.params.id, name: req.params.id });
  a.lastSeen = Date.now();
  a.online = true;
  a.status = req.body?.status || a.status || 'idle';
  a.activity = req.body?.activity || a.activity || '';
  save();
  broadcast('agent', a);
  res.json({ ok: true, serverTime: Date.now() });
});

// ----- messages -----
// POST /api/messages { from, to, body }  -> kirim pesan
app.post('/api/messages', (req, res) => {
  const { from, to, body, kind } = req.body || {};
  if (!from || !to || !body) return res.status(400).json({ error: 'from, to, body wajib' });
  // pastikan agent terdaftar
  for (const id of [from, to]) {
    if (!db.agents[id]) db.agents[id] = { id, name: id, online: false, lastSeen: 0, activity: '', status: 'idle' };
  }
  const m = {
    id: crypto.randomUUID(),
    seq: ++db.seq,
    from, to, body: String(body).slice(0, 8000),
    kind: kind || 'chat',
    read: false,
    createdAt: Date.now(),
  };
  db.messages.push(m);
  if (db.messages.length > 5000) db.messages = db.messages.slice(-4000);
  save();
  broadcast('message', m);
  res.json(m);
});

// GET /api/messages?agent=vela-one&unread=1&since=<seq>  -> inbox agent
app.get('/api/messages', (req, res) => {
  const { agent, unread, since, with: peer } = req.query;
  let list = db.messages;
  if (agent) list = list.filter((m) => m.to === agent || m.from === agent);
  if (peer) list = list.filter((m) => m.to === agent && m.from === peer || m.from === agent && m.to === peer);
  if (unread === '1' && agent) list = list.filter((m) => m.to === agent && !m.read);
  if (since) list = list.filter((m) => m.seq > Number(since));
  res.json(list.slice(-200));
});

// POST /api/messages/:id/read -> tandai dibaca
app.post('/api/messages/:id/read', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  m.read = true;
  save();
  broadcast('read', { id: m.id });
  res.json({ ok: true });
});

// ----- stats (Server & layanan panel) -----
let prevCpu = os.cpus().map((c) => c.times);
function cpuPercent() {
  const cur = os.cpus().map((c) => c.times);
  let idleDiff = 0, totalDiff = 0;
  cur.forEach((t, i) => {
    const p = prevCpu[i];
    const idle = t.idle - p.idle;
    const total = Object.values(t).reduce((a, b) => a + b, 0) - Object.values(p).reduce((a, b) => a + b, 0);
    idleDiff += idle; totalDiff += total;
  });
  prevCpu = cur;
  return totalDiff ? +((1 - idleDiff / totalDiff) * 100).toFixed(1) : 0;
}

let prevNet = null;
function netIO() {
  // baca /proc/net/dev untuk trafik
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rx = 0, tx = 0;
    for (const l of lines) {
      const p = l.trim().split(/\s+/);
      if (p.length > 9) { rx += +p[1]; tx += +p[9]; }
    }
    const now = Date.now();
    let rate = { rx: 0, tx: 0 };
    if (prevNet) {
      const dt = (now - prevNet.t) / 1000;
      rate = { rx: Math.round((rx - prevNet.rx) / dt), tx: Math.round((tx - prevNet.tx) / dt) };
    }
    prevNet = { rx, tx, t: now };
    return rate;
  } catch { return { rx: 0, tx: 0 }; }
}

function diskStats() {
  try {
    const out = fs.statfsSync('/');
    const total = out.blocks * out.bsize;
    const free = out.bavail * out.bsize;
    return { totalGB: +(total / 1e9).toFixed(1), usedGB: +((total - free) / 1e9).toFixed(1) };
  } catch { return { totalGB: 0, usedGB: 0 }; }
}

app.get('/api/stats', (_req, res) => {
  const total = os.totalmem(), free = os.freemem();
  const d = diskStats();
  const net = netIO();
  res.json({
    cpu: cpuPercent(),
    cpuCount: os.cpus().length,
    mem: { usedMB: +((total - free) / 1e6).toFixed(0), totalMB: +(total / 1e6).toFixed(0) },
    disk: { usedGB: d.usedGB, totalGB: d.totalGB },
    uptime: os.uptime(),
    load: os.loadavg(),
    net,
    platform: `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
  });
});

// ----- activity log (buat feed di panel) -----
app.get('/api/activity', (_req, res) => {
  const acts = db.messages.slice(-40).reverse().map((m) => ({
    ts: m.createdAt,
    agent: m.from,
    text: `${m.from} → ${m.to}: ${m.body.slice(0, 80)}`,
  }));
  res.json(acts);
});

// ----- health -----
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now(), seq: db.seq }));

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', payload: { agents: Object.values(db.agents), seq: db.seq } }));
});

server.listen(PORT, () => {
  console.log(`[VCC] Command Center listening on http://0.0.0.0:${PORT}`);
  console.log(`[VCC] data: ${DATA_DIR}`);
});
