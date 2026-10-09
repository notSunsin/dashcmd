#!/usr/bin/env node
/**
 * Vela Agent Bridge
 * Dijalankan DI DALAM konteks tiap profile Vela.
 *
 * Tugas:
 *  1. Kirim heartbeat ke Command Center (biar status "online" kelihatan di 3D)
 *  2. Polling inbox tiap 15 detik
 *  3. Kalau ada pesan untuk dia → generate balasan (via `hermes chat -q` di profile-nya, atau template lokal)
 *  4. Kirim balasan + tandai pesan dibaca
 *
 * Usage:
 *   VCC_URL=http://127.0.0.1:8787 \
 *   VCC_AGENT=vela-one \
 *   HERMES_PROFILE=vela-one \
 *   node bridge/vela-bridge.js
 */
const VCC_URL = process.env.VCC_URL || 'http://127.0.0.1:8787';
const AGENT = process.env.VCC_AGENT || 'vela-one';
const PROFILE = process.env.HERMES_PROFILE || '';
const INTERVAL_MS = Number(process.env.VCC_POLL_MS || 15_000);
const USE_HERMES = process.env.VCC_USE_HERMES !== '0'; // set 0 untuk mode echo (testing)

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const keyPath = path.join(os.homedir(), '.hermes', 'bin', 'hermes');
const HERMES_BIN = fs.existsSync(keyPath) ? keyPath : 'hermes';

async function api(method, p, body) {
  const r = await fetch(VCC_URL + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}`);
  return r.json();
}

/** Panggil hermes di profile tertentu untuk menghasilkan balasan. */
function askHermes(text) {
  return new Promise((resolve) => {
    const args = [];
    if (PROFILE) args.push('-p', PROFILE);
    args.push('chat', '-q', text);
    const child = spawn(HERMES_BIN, args, {
      env: { ...process.env },
      timeout: 120_000,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', () => resolve(out.trim() || '(tidak ada balasan)'));
    child.on('error', (e) => resolve(`(error: ${e.message})`));
  });
}

/** Balasan sederhana kalau mode echo (tanpa LLM). */
function echoReply(msg) {
  return `[${AGENT}] Pesan diterima: "${msg.body.slice(0, 120)}" — balasan otomatis (mode echo).`;
}

let stopped = false;
async function tick() {
  if (stopped) return;
  try {
    await api('POST', `/api/agents/${AGENT}/heartbeat`, { status: 'polling', activity: 'cek inbox' });
    const unread = await api('GET', `/api/messages?agent=${AGENT}&unread=1`);
    for (const m of unread) {
      console.log(`[${AGENT}] << dari ${m.from}: ${m.body.slice(0, 100)}`);
      await api('POST', `/api/agents/${AGENT}/heartbeat`, { status: 'thinking', activity: `balas ${m.from}` });
      const reply = USE_HERMES ? await askHermes(m.body) : echoReply(m);
      await api('POST', '/api/messages', { from: AGENT, to: m.from, body: reply, kind: 'reply' });
      await api('POST', `/api/messages/${m.id}/read`);
      console.log(`[${AGENT}] >> balasan terkirim (${reply.length} char)`);
    }
    await api('POST', `/api/agents/${AGENT}/heartbeat`, { status: 'idle', activity: unread.length ? 'baru selesai balas' : 'idle' });
  } catch (e) {
    console.error(`[${AGENT}] error: ${e.message}`);
  }
  if (!stopped) setTimeout(tick, INTERVAL_MS);
}

process.on('SIGINT', () => { stopped = true; process.exit(0); });
console.log(`[bridge] agent=${AGENT} profile=${PROFILE || '(default)'} url=${VCC_URL} interval=${INTERVAL_MS}ms`);
tick();
