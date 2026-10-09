# Vela Command Center 🛰️

Dashboard **3D virtual office** buat monitoring & menghubungkan beberapa profile **Hermes/Vela agent** dalam satu tempat.

![stack](https://img.shields.io/badge/Three.js-r169-orange) ![node](https://img.shields.io/badge/node-18%2B-green)

## Fitur

- 🏢 **3D office scene** (Three.js) — 2 stasiun kerja agent, layar monitor berubah warna sesuai status (idle/thinking/offline), neon sign, sofa, tanaman
- 💬 **Chat antar-agent realtime** — kirim pesan dari dashboard ke agent mana pun, feed update via WebSocket
- 🤖 **Auto-reply bridge** — tiap agent polling inbox **tiap 15 detik**; ada pesan untuk dia → auto-generate balasan via `hermes chat -p <profile>` (atau mode echo untuk testing)
- 🖥️ **Server & layanan panel** — CPU/RAM/Disk/uptime/trafik jaringan live
- 👥 **Heartbeat tim** — status online/offline agent berdasarkan heartbeat terakhir
- 🎥 **Auto-tour & orbit camera**

## Struktur

```
vela-command-center/
├── server/index.js        # Express + WS backend (REST API + stats + store)
├── bridge/vela-bridge.js  # Agent bridge (heartbeat + polling 15s + auto-reply)
├── public/
│   ├── index.html         # Dashboard UI
│   ├── css/style.css
│   └── js/
│       ├── scene.js       # 3D scene (Three.js)
│       └── app.js         # WebSocket + UI logic
└── data/                  # message store (dibuat otomatis)
```

## Menjalankan

```bash
npm install
npm start                    # server di http://localhost:8787
```

Jalankan bridge untuk tiap profile Vela (di mesin yang sama atau lain — sesuaikan VCC_URL):

```bash
# mode LLM (balasan via hermes di profile itu):
VCC_URL=http://127.0.0.1:8787 VCC_AGENT=vela-one HERMES_PROFILE=vela-one \
  node bridge/vela-bridge.js

VCC_URL=http://127.0.0.1:8787 VCC_AGENT=vela-two HERMES_PROFILE=vela-two \
  node bridge/vela-bridge.js

# mode echo (testing tanpa LLM):
VCC_USE_HERMES=0 VCC_AGENT=vela-one node bridge/vela-bridge.js
```

## API

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | health check |
| `GET /api/stats` | CPU/RAM/disk/net/uptime |
| `GET /api/agents` | daftar agent + status online |
| `POST /api/agents/:id/heartbeat` | heartbeat agent |
| `GET /api/messages?agent=X&unread=1&since=SEQ` | inbox agent |
| `POST /api/messages` | kirim pesan `{from,to,body}` |
| `POST /api/messages/:id/read` | tandai dibaca |
| `WS /ws` | push realtime (message/agent/read) |

## Bikin 2 profile Vela di Hermes

```bash
hermes profile create vela-one
hermes profile create vela-two
# lalu masing-masing profile diset bot channel-nya (Telegram/Discord) sesuai kebutuhan
```

## Catatan

- Port default: `8787` (ubah via `VCC_PORT`)
- Data pesan tersimpan di `data/messages.json` (ringan, cap 5000 pesan)
- Buat akses publik: tunnelkan (ngrok/cloudflared) atau reverse proxy

## Lisensi

MIT
