import { normalizeServerUrl } from "./utils";

// 256 KB chunks for high WebRTC throughput
const CHUNK_SIZE = 256 * 1024;
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024; // 4 MB backpressure threshold

export class P2PTransfer {
  constructor({ code, role, serverUrl, onStatus, onError, onFile, onProgress }) {
    this.code = code;
    this.role = role;
    this.serverUrl = serverUrl;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onFile = onFile;
    this.onProgress = onProgress;
    this.ws = null;
    this.pc = null;
    this.channel = null;
    this.currentInbound = null;
  }

  connect() {
    const targetUrl = normalizeServerUrl(this.serverUrl);

    try {
      this.ws = new WebSocket(targetUrl);
    } catch (err) {
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      let msg = err.message || "Failed to create WebSocket connection.";
      if (isHttps) {
        msg = "HTTPS pages require secure WebSockets (wss://). Insecure connection blocked by browser.";
      }
      this.onError?.(msg);
      this.onStatus?.("disconnected");
      return;
    }

    this.ws.onopen = () => {
      this.onStatus?.("connected-to-signaling");
      this.ws.send(
        JSON.stringify({ type: "join", code: this.code, role: this.role })
      );
      this.setupPeer();
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "peer-ready" && this.role === "sender") {
        await this.createOffer();
      }

      if (message.type === "signal") {
        await this.handleSignal(message.data);
      }

      if (message.type === "error") {
        this.onError?.(message.message || "Signaling error");
      }
    };

    this.ws.onerror = () => {
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      const msg = isHttps
        ? `Could not connect to signaling server at "${targetUrl}". GitHub Pages (HTTPS) requires a WSS signaling server. Deploy server/index.js to Render/Fly.io or access via HTTP for local testing.`
        : `Could not reach signaling server at "${targetUrl}". Ensure the signaling server is running (npm run server).`;
      this.onError?.(msg);
    };

    this.ws.onclose = () => {
      this.onStatus?.("disconnected");
    };
  }

  setupPeer() {
    // Direct LAN only: Empty iceServers array ensures no public STUN/TURN servers are queried
    this.pc = new RTCPeerConnection({
      iceServers: [],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Enforce Direct LAN (host candidate) only
        const candStr = typeof event.candidate.candidate === "string" ? event.candidate.candidate : "";
        const isHost = event.candidate.type === "host" || candStr.includes("typ host");

        if (isHost) {
          this.sendSignal({ candidate: event.candidate });
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      if (state === "failed") {
        this.onError?.(
          "Direct LAN connection failed. Ensure both devices are on the same Wi-Fi network and router AP/Client isolation is disabled."
        );
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onStatus?.(this.pc.connectionState);
    };

    if (this.role === "sender") {
      this.channel = this.pc.createDataChannel("origin-transfer", { ordered: true });
      this.bindChannel();
    } else {
      this.pc.ondatachannel = (event) => {
        this.channel = event.channel;
        this.bindChannel();
      };
    }
  }

  bindChannel() {
    if (!this.channel) return;

    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = 1024 * 1024; // 1 MB

    this.channel.onopen = () => {
      this.onStatus?.("ready");
    };

    this.channel.onclose = () => {
      this.onStatus?.("channel-closed");
    };

    const finalizeInboundIfComplete = () => {
      if (!this.currentInbound) return;
      const { name, size, type, received, chunks, hasEndSignal } = this.currentInbound;

      const isComplete = received >= size || (hasEndSignal && received > 0 && received >= size * 0.999);
      if (isComplete) {
        const blob = new Blob(chunks, { type: type || "application/octet-stream" });
        this.onFile?.({ name, size, type, blob });
        this.onProgress?.({
          direction: "receive",
          fileName: name,
          percent: 100,
        });
        this.currentInbound = null;
      }
    };

    this.channel.onmessage = async (event) => {
      if (typeof event.data === "string") {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === "file-meta") {
          this.currentInbound = {
            name: message.name,
            type: message.mimeType,
            size: message.size,
            received: 0,
            chunks: [],
            hasEndSignal: false,
          };
          this.onProgress?.({
            direction: "receive",
            fileName: message.name,
            percent: 0,
          });
        }

        if (message.type === "file-end" && this.currentInbound) {
          this.currentInbound.hasEndSignal = true;
          finalizeInboundIfComplete();
        }

        return;
      }

      let chunk = event.data;
      if (chunk instanceof Blob) {
        chunk = await chunk.arrayBuffer();
      }

      if (!this.currentInbound) return;

      this.currentInbound.chunks.push(chunk);
      this.currentInbound.received += chunk.byteLength;

      const percent = this.currentInbound.size
        ? Math.min(100, Math.round((this.currentInbound.received / this.currentInbound.size) * 100))
        : 0;
      this.onProgress?.({
        direction: "receive",
        fileName: this.currentInbound.name,
        percent,
      });

      finalizeInboundIfComplete();
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ sdp: this.pc.localDescription });
  }

  async handleSignal(data) {
    if (data.sdp) {
      const remoteDescription = new RTCSessionDescription(data.sdp);
      await this.pc.setRemoteDescription(remoteDescription);

      if (remoteDescription.type === "offer") {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ sdp: this.pc.localDescription });
      }
    }

    if (data.candidate) {
      const candStr = typeof data.candidate === "string"
        ? data.candidate
        : data.candidate.candidate || "";
      const isHost = data.candidate.type === "host" || candStr.includes("typ host");

      if (isHost) {
        try {
          await this.pc.addIceCandidate(data.candidate);
        } catch {
          this.onError?.("Could not add direct LAN candidate");
        }
      }
    }
  }

  sendSignal(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "signal", code: this.code, role: this.role, data }));
  }

  async waitForBuffer() {
    if (!this.channel || this.channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
      return;
    }
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          this.channel?.removeEventListener("bufferedamountlow", done);
          resolve();
        }
      };

      this.channel?.addEventListener("bufferedamountlow", done);

      const checkInterval = setInterval(() => {
        const lowThreshold = this.channel?.bufferedAmountLowThreshold || 1024 * 1024;
        if (!this.channel || this.channel.bufferedAmount <= lowThreshold) {
          clearInterval(checkInterval);
          done();
        }
      }, 15);
    });
  }

  async drainBuffer() {
    if (!this.channel || this.channel.bufferedAmount === 0) return;
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.channel || this.channel.bufferedAmount === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 15);
    });
  }

  async sendFiles(files) {
    if (!this.channel || this.channel.readyState !== "open") {
      throw new Error("Peer connection is not ready");
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let sentBytes = 0;

    for (const file of files) {
      this.channel.send(
        JSON.stringify({
          type: "file-meta",
          name: file.name,
          mimeType: file.type,
          size: file.size,
        })
      );

      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        await this.waitForBuffer();

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const data = await chunk.arrayBuffer();

        this.channel.send(data);
        sentBytes += data.byteLength;
        const percent = totalBytes ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;
        this.onProgress?.({ direction: "send", fileName: file.name, percent });
      }

      await this.drainBuffer();
      this.channel.send(JSON.stringify({ type: "file-end" }));
      await this.drainBuffer();
    }
  }

  destroy() {
    this.channel?.close();
    this.pc?.close();
    this.ws?.close();
  }
}

