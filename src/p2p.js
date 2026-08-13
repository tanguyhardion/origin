import { normalizeServerUrl } from "./utils";

// 64 KB chunks for max local LAN DataChannel throughput within standard SCTP packet limits
const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024; // 4 MB backpressure threshold
const LOW_BUFFER_THRESHOLD = 1024 * 1024; // 1 MB low buffer threshold

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
    this.pendingCandidates = [];
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
      this.onStatus?.(this.role === "sender" ? "waiting-for-receiver" : "connected-to-signaling");
      this.ws.send(
        JSON.stringify({ type: "join", code: this.code, role: this.role })
      );
      this.setupPeer();
    };

    this.ws.onmessage = async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "peer-ready") {
        this.onStatus?.("connecting");
        if (this.role === "sender") {
          await this.createOffer();
        }
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
        ? `Could not connect to signaling server at "${targetUrl}". HTTPS requires a WSS signaling server.`
        : `Could not reach signaling server at "${targetUrl}". Ensure the signaling server is running (npm run server).`;
      this.onError?.(msg);
    };

    this.ws.onclose = () => {
      this.onStatus?.("disconnected");
    };
  }

  setupPeer() {
    this.pendingCandidates = [];

    // Direct LAN only: Empty iceServers array ensures no STUN/TURN servers are used
    this.pc = new RTCPeerConnection({
      iceServers: [],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidatePayload = event.candidate.toJSON
          ? event.candidate.toJSON()
          : event.candidate;
        this.sendSignal({ candidate: candidatePayload });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      if (state === "connected" || state === "completed") {
        if (this.channel && this.channel.readyState === "open") {
          this.onStatus?.("ready");
        } else {
          this.onStatus?.("connected");
        }
      } else if (state === "failed") {
        this.onError?.(
          "Direct LAN connection failed. Ensure both devices are on the same Wi-Fi/network and AP isolation is disabled on your router."
        );
        this.onStatus?.("failed");
      } else if (state === "disconnected") {
        this.onStatus?.("disconnected");
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === "connected") {
        if (this.channel && this.channel.readyState === "open") {
          this.onStatus?.("ready");
        } else {
          this.onStatus?.("connected");
        }
      } else if (state === "failed") {
        this.onStatus?.("failed");
      } else if (state === "disconnected") {
        this.onStatus?.("disconnected");
      }
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
    this.channel.bufferedAmountLowThreshold = LOW_BUFFER_THRESHOLD;

    this.channel.onopen = () => {
      this.onStatus?.("ready");
    };

    this.channel.onclose = () => {
      this.onStatus?.("channel-closed");
    };

    const finalizeInbound = () => {
      if (!this.currentInbound) return;
      const { name, size, type, chunks } = this.currentInbound;

      const blob = new Blob(chunks, { type: type || "application/octet-stream" });
      this.onFile?.({ name, size, type, blob });
      this.onProgress?.({
        direction: "receive",
        fileName: name,
        percent: 100,
      });
      this.currentInbound = null;
    };

    const checkAndFinalize = () => {
      if (!this.currentInbound) return;
      const { size, received, hasEndSignal } = this.currentInbound;

      if (received >= size || hasEndSignal) {
        finalizeInbound();
      }
    };

    this.channel.onmessage = (event) => {
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
          checkAndFinalize();
        }

        return;
      }

      if (!this.currentInbound) return;

      const handleDataBuffer = (buffer) => {
        if (!this.currentInbound) return;
        this.currentInbound.chunks.push(buffer);
        this.currentInbound.received += buffer.byteLength;

        const percent = this.currentInbound.size
          ? Math.min(100, Math.round((this.currentInbound.received / this.currentInbound.size) * 100))
          : 0;

        this.onProgress?.({
          direction: "receive",
          fileName: this.currentInbound.name,
          percent,
        });

        checkAndFinalize();
      };

      if (event.data instanceof ArrayBuffer) {
        handleDataBuffer(event.data);
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(handleDataBuffer);
      }
    };
  }

  async createOffer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendSignal({ sdp: this.pc.localDescription });
    } catch (err) {
      this.onError?.(err.message || "Failed to create offer");
    }
  }

  async handleSignal(data) {
    if (!data) return;

    if (data.sdp) {
      try {
        const remoteDescription = new RTCSessionDescription(data.sdp);
        await this.pc.setRemoteDescription(remoteDescription);

        // Process any queued candidates that arrived before setRemoteDescription
        while (this.pendingCandidates.length > 0) {
          const cand = this.pendingCandidates.shift();
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn("Could not add queued ICE candidate:", e);
          }
        }

        if (remoteDescription.type === "offer") {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.sendSignal({ sdp: this.pc.localDescription });
        }
      } catch (err) {
        this.onError?.(err.message || "SDP signaling error");
      }
    }

    if (data.candidate) {
      if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
        this.pendingCandidates.push(data.candidate);
      } else {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn("Could not add ICE candidate:", e);
        }
      }
    }
  }

  sendSignal(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "signal", code: this.code, role: this.role, data }));
  }

  async waitForBuffer() {
    if (!this.channel || this.channel.bufferedAmount < MAX_BUFFERED_AMOUNT) {
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
        if (!this.channel || this.channel.bufferedAmount <= LOW_BUFFER_THRESHOLD) {
          clearInterval(checkInterval);
          done();
        }
      }, 5);
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
      }, 5);
    });
  }

  async sendFiles(files) {
    if (!this.channel || this.channel.readyState !== "open") {
      throw new Error("Direct LAN peer connection is not ready");
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let sentBytes = 0;

    for (const file of files) {
      await this.drainBuffer();
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
    this.pendingCandidates = [];
  }
}


