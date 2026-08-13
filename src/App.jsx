import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Download,
  Image,
  Loader2,
  Plus,
  QrCode,
  RefreshCcw,
  Send,
  Smartphone,
  Video,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { P2PTransfer } from "./p2p";
import { encodeTransferPayload, generateTransferCode, parseTransferPayload } from "./transferCode";
import { formatBytes, transferName, triggerDownload, defaultServerUrl, normalizeServerUrl } from "./utils";

function formatStatusDescription(status, mode) {
  switch (status) {
    case "idle":
      return "Idle";
    case "waiting-for-receiver":
      return "Waiting for receiver...";
    case "connected-to-signaling":
      return mode === "receiver"
        ? "Connected to signaling"
        : "Signaling active · Waiting for receiver";
    case "connecting":
      return mode === "receiver"
        ? "Connecting to sender (Direct LAN)..."
        : "Connecting P2P (Direct LAN)...";
    case "connected":
      return "LAN connected · Initializing channel...";
    case "ready":
      return "Ready (Direct LAN)";
    case "channel-closed":
      return "Channel closed";
    case "disconnected":
      return "Disconnected";
    case "failed":
      return "Connection failed";
    default:
      return status;
  }
}

export default function App() {
  const [mode, setMode] = useState("sender");
  const [queue, setQueue] = useState([]);
  const [received, setReceived] = useState([]);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [transferCode, setTransferCode] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);
  const transferRef = useRef(null);

  // Clean up P2P connection on unmount
  useEffect(() => {
    return () => {
      transferRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (mode === "sender") {
      connectAsSender();
    } else {
      transferRef.current?.destroy();
      transferRef.current = null;
      setStatus("idle");
    }
  }, [mode]);

  const totalBytes = useMemo(
    () => queue.reduce((sum, entry) => sum + entry.file.size, 0),
    [queue]
  );

  function clearQueue() {
    queue.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    setQueue([]);
  }

  function addFiles(files) {
    const next = Array.from(files || []).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (!next.length) {
      setToast("Select photos or videos to transfer.");
      return;
    }

    setQueue((current) => [
      ...current,
      ...next.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function connectAsSender() {
    transferRef.current?.destroy();
    const code = generateTransferCode();
    setTransferCode(code);
    setStatus("waiting-for-receiver");
    setProgress(0);

    const activeServerUrl = normalizeServerUrl(serverUrl);

    const transfer = new P2PTransfer({
      code,
      role: "sender",
      serverUrl: activeServerUrl,
      onStatus: setStatus,
      onError: (message) => setToast(message),
      onProgress: ({ percent }) => setProgress(percent),
    });

    transfer.connect();
    transferRef.current = transfer;
  }

  function connectAsReceiver() {
    const parsed = parseTransferPayload(connectCode);
    if (!parsed.code) {
      setToast("Enter a transfer code.");
      return;
    }

    transferRef.current?.destroy();
    setStatus("connecting");
    setProgress(0);

    const activeServerUrl = normalizeServerUrl(parsed.serverUrl || serverUrl);

    const transfer = new P2PTransfer({
      code: parsed.code,
      role: "receiver",
      serverUrl: activeServerUrl,
      onStatus: setStatus,
      onError: (message) => setToast(message),
      onProgress: ({ percent }) => setProgress(percent),
      onFile: (file) => {
        triggerDownload(file.blob, file.name);
        setReceived((current) => [
          {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            blob: file.blob,
          },
          ...current,
        ]);
      },
    });

    transfer.connect();
    transferRef.current = transfer;
  }

  async function sendQueuedFiles() {
    const transfer = transferRef.current;
    if (!transfer) {
      setToast("Start a sender session first.");
      return;
    }
    if (!queue.length) {
      setToast("No files queued.");
      return;
    }

    setIsSending(true);
    try {
      await transfer.sendFiles(queue.map((entry) => entry.file));
      queue.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      setQueue([]);
      setToast("Transfer complete.");
    } catch (error) {
      setToast(error.message || "Transfer failed.");
    } finally {
      setIsSending(false);
    }
  }

  const qrPayload = transferCode
    ? encodeTransferPayload({ code: transferCode, serverUrl: normalizeServerUrl(serverUrl) })
    : "";

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";

  return (
    <main className="app-shell">
      <div className="aurora" />
      <section className="phone-stage">
        <header className="topbar">
          <span className="brand-mark">
            <Smartphone size={18} />
            <strong>Origin</strong>
          </span>
          <div className="section-actions">
            <button className={`bulk-button quiet ${mode === "sender" ? "active" : ""}`} onClick={() => setMode("sender")}>
              Sender
            </button>
            <button className={`bulk-button quiet ${mode === "receiver" ? "active" : ""}`} onClick={() => setMode("receiver")}>
              Receiver
            </button>
          </div>
        </header>

        <section className="drop-zone">
          <label className="eyebrow">Signaling server</label>
          <input
            className="server-input"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder={isHttps ? "wss://192.168.1.10:3001" : "ws://192.168.1.10:3001"}
          />
          <p>Both devices must be on the same WiFi/hotspot and use the same server URL.</p>
          {isHttps && (
            <small style={{ color: "#f87171", marginTop: "4px", display: "block" }}>
              ⚠️ Page loaded via HTTPS: Browsers enforce secure WebSockets (wss://). Insecure ws:// connections are auto-converted to wss://.
            </small>
          )}
          <div className="trust-row">
            <span>
              <Check size={15} /> Direct LAN P2P transfer (Local Wi-Fi Only)
            </span>
            <span>
              <Download size={15} /> Files save to receiver device
            </span>
          </div>
        </section>

        {mode === "sender" ? (
          <section className="upload-sheet glass">
            <div className="sheet-head">
              <div>
                <strong>Sender</strong>
                <span>Status: {formatStatusDescription(status, "sender")}</span>
              </div>
              <button className="icon-button quiet" onClick={connectAsSender} title="New code">
                <RefreshCcw size={18} />
              </button>
            </div>

            {transferCode && (
              <div className="transfer-code-box">
                <strong>{transferCode}</strong>
                <div className="qr-wrap">
                  <QRCodeSVG value={qrPayload} size={140} bgColor="transparent" fgColor="#F7F7FB" />
                </div>
                <span>Scan the QR or enter code on receiver.</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: "none" }}
              onChange={(event) => addFiles(event.target.files)}
            />
            <button className="add-button" onClick={() => fileInputRef.current?.click()}>
              <span>
                <Plus size={30} />
              </span>
              Select photos or videos
            </button>

            {queue.length > 0 && (
              <>
                <div className="preview-strip">
                  {queue.map((entry) => (
                    <QueuedFile key={entry.id} entry={entry} />
                  ))}
                </div>
                <div className="sheet-head">
                  <span>{queue.length} files · {formatBytes(totalBytes)}</span>
                  <button className="icon-button quiet" onClick={clearQueue}>
                    <X size={18} />
                  </button>
                </div>
              </>
            )}

            <div className="total-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
            <button className="primary-button" onClick={sendQueuedFiles} disabled={isSending || status !== "ready"}>
              {isSending ? <Loader2 className="spin" size={19} /> : <Send size={20} />}
              {isSending ? `Sending ${progress}%` : "Send files"}
            </button>
          </section>
        ) : (
          <section className="upload-sheet glass">
            <div className="sheet-head">
              <div>
                <strong>Receiver</strong>
                <span>Status: {formatStatusDescription(status, "receiver")}</span>
              </div>
              <QrCode size={18} />
            </div>

            <input
              className="server-input"
              value={connectCode}
              onChange={(event) => setConnectCode(event.target.value)}
              placeholder="Paste transfer code or QR payload"
            />
            <button className="primary-button" onClick={connectAsReceiver}>
              Connect to sender
            </button>

            <div className="total-bar">
              <span style={{ width: `${progress}%` }} />
            </div>

            <section className="inbox">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Received now</span>
                  <h2>{transferName()}</h2>
                </div>
              </div>

              <div className="file-list">
                {received.map((item) => (
                  <ReceivedFileCard key={item.id} item={item} />
                ))}
                {!received.length && (
                  <div className="empty-state">
                    <Image size={38} />
                    <strong>No files received yet</strong>
                    <span>Files are downloaded immediately when transfer completes.</span>
                  </div>
                )}
              </div>
            </section>
          </section>
        )}
      </section>

      {toast && (
        <motion.button
          className="toast"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={() => setToast("")}
        >
          {toast}
        </motion.button>
      )}
    </main>
  );
}

function QueuedFile({ entry }) {
  const isVideo = entry.file.type.startsWith("video/");
  return (
    <article className="queue-card">
      {isVideo ? <video src={entry.previewUrl} muted playsInline /> : <img src={entry.previewUrl} alt="" />}
      <div className="queue-meta">
        <span>
          {isVideo ? <Video size={13} /> : <Image size={13} />} {entry.file.name}
        </span>
        <small>{formatBytes(entry.file.size)}</small>
      </div>
    </article>
  );
}

function ReceivedFileCard({ item }) {
  const isVideo = item.type?.startsWith("video/");
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!item.blob) return;
    const url = URL.createObjectURL(item.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.blob]);

  return (
    <article className="file-card glass">
      <div className="select-hit">
        <span>
          {isVideo ? <Video size={14} /> : <Image size={14} />}
        </span>
      </div>
      <button className="thumb" onClick={() => triggerDownload(item.blob, item.name)} title="Download file">
        {objectUrl ? (
          isVideo ? (
            <video src={objectUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
          ) : (
            <img src={objectUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
          )
        ) : isVideo ? (
          <Video size={24} />
        ) : (
          <Image size={24} />
        )}
      </button>
      <button className="file-copy" onClick={() => triggerDownload(item.blob, item.name)}>
        <strong>{item.name}</strong>
        <span>{formatBytes(item.size)}</span>
      </button>
      <button className="icon-button download" onClick={() => triggerDownload(item.blob, item.name)} title="Download file">
        <Download size={18} />
      </button>
    </article>
  );
}

