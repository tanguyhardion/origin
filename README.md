# Origin

Origin is a mobile-first direct transfer app for moving original photos and videos between two devices.

By default, Origin attempts a direct LAN path (shared WiFi/hotspot) for fastest transfer. If LAN peer connectivity fails, it automatically retries through an Internet-capable WebRTC path.

Files do **not** pass through cloud storage. They are transferred over WebRTC data channels and downloaded directly on the receiver device.

## Project structure

- `src/` — React sender/receiver UI
- `server/` — Node.js signaling server (`express` + `ws`) used only to exchange WebRTC signaling messages

## Local setup

Install dependencies for both frontend and signaling server from the repo root:

```bash
npm install
```

Run the signaling server:

```bash
npm run server
```

Run the frontend in another terminal:

```bash
npm run dev
```

## Transfer flow

1. Sender starts a session and gets a QR transfer code.
2. Receiver enters the code (or QR payload) and connects through the signaling server.
3. After WebRTC connection is established, files stream directly between peers.
4. Received files are immediately downloaded to the receiving device.

## Notes

- Both devices must use the same signaling server URL.
- LAN is attempted first; when direct LAN fails, Origin retries with public STUN-based Internet ICE candidates.
- Some strict NAT/firewall networks still require a TURN relay server for reliable Internet fallback.
- The signaling server relays only session metadata/ICE candidates, never file bytes.
- Origin does not persist transfer history.
