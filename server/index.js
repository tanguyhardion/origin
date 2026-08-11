import express from "express";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";

const app = express();
const port = Number(process.env.PORT || 3001);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = app.listen(port, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

  console.log(`Origin signaling server listening on 0.0.0.0:${port}`);
  ips.forEach((ip) => {
    console.log(`Local network URL: ws://${ip}:${port}`);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { sender: null, receiver: null });
  }
  return rooms.get(code);
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && !room.sender && !room.receiver) {
    rooms.delete(code);
  }
}

wss.on("connection", (ws) => {
  let joinedCode = "";
  let joinedRole = "";

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (message.type === "join") {
      const { code, role } = message;
      if (!code || (role !== "sender" && role !== "receiver")) {
        send(ws, { type: "error", message: "Invalid join payload" });
        return;
      }

      joinedCode = code;
      joinedRole = role;

      const room = getRoom(code);
      room[role] = ws;

      const otherRole = role === "sender" ? "receiver" : "sender";
      const otherPeer = room[otherRole];
      if (otherPeer) {
        send(ws, { type: "peer-ready" });
        send(otherPeer, { type: "peer-ready" });
      }

      return;
    }

    if (message.type === "signal") {
      const room = rooms.get(message.code);
      if (!room) return;
      const target = message.role === "sender" ? room.receiver : room.sender;
      send(target, { type: "signal", data: message.data });
    }
  });

  ws.on("close", () => {
    if (!joinedCode || !joinedRole) return;
    const room = rooms.get(joinedCode);
    if (!room) return;

    room[joinedRole] = null;
    const otherRole = joinedRole === "sender" ? "receiver" : "sender";
    send(room[otherRole], { type: "error", message: "Peer disconnected" });
    cleanupRoom(joinedCode);
  });
});
