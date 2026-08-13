import { normalizeServerUrl } from "./utils";

const CHUNK_SIZE = 64 * 1024;

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
        ? "WebSocket connection failed over WSS. Ensure your signaling server supports SSL/WSS, or use HTTP for local ws:// testing."
        : "Failed to reach signaling server. Make sure the signaling server is running.";
      this.onError?.(msg);
    };

    this.ws.onclose = () => {
      this.onStatus?.("disconnected");
    };
  }

  setupPeer() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ candidate: event.candidate });
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

    this.channel.onopen = () => {
      this.onStatus?.("ready");
    };

    this.channel.onclose = () => {
      this.onStatus?.("channel-closed");
    };

    this.channel.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const message = JSON.parse(event.data);

        if (message.type === "file-meta") {
          this.currentInbound = {
            name: message.name,
            type: message.mimeType,
            size: message.size,
            received: 0,
            chunks: [],
          };
        }

        if (message.type === "file-end" && this.currentInbound) {
          const file = this.currentInbound;
          const blob = new Blob(file.chunks, { type: file.type || "application/octet-stream" });
          this.onFile?.({ name: file.name, size: file.size, type: file.type, blob });
          this.currentInbound = null;
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
        ? Math.round((this.currentInbound.received / this.currentInbound.size) * 100)
        : 0;
      this.onProgress?.({
        direction: "receive",
        fileName: this.currentInbound.name,
        percent,
      });
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
      try {
        await this.pc.addIceCandidate(data.candidate);
      } catch {
        this.onError?.("Could not add ICE candidate");
      }
    }
  }

  sendSignal(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "signal", code: this.code, role: this.role, data }));
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
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const data = await chunk.arrayBuffer();

        while (this.channel.bufferedAmount > 2 * 1024 * 1024) {
          await new Promise((resolve) => setTimeout(resolve, 8));
        }

        this.channel.send(data);
        sentBytes += data.byteLength;
        const percent = totalBytes ? Math.round((sentBytes / totalBytes) * 100) : 0;
        this.onProgress?.({ direction: "send", fileName: file.name, percent });
      }

      this.channel.send(JSON.stringify({ type: "file-end" }));
    }
  }

  destroy() {
    this.channel?.close();
    this.pc?.close();
    this.ws?.close();
  }
}
