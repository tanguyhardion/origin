import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  Check,
  CheckSquare,
  Download,
  FileArchive,
  Image,
  Loader2,
  Plus,
  QrCode,
  RefreshCcw,
  ScanLine,
  Send,
  Smartphone,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { P2PTransfer } from "./p2p";
import { encodeTransferPayload, generateTransferCode, parseTransferPayload } from "./transferCode";
import {
  defaultServerUrl,
  downloadFilesAsZip,
  formatBytes,
  normalizeServerUrl,
  transferName,
  triggerDownload,
} from "./utils";
import QrScannerModal from "./QrScannerModal";

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
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem("origin_mode") || "sender";
    } catch {
      return "sender";
    }
  });

  const [queue, setQueue] = useState([]);
  const [received, setReceived] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem("origin_server_url") || defaultServerUrl();
    } catch {
      return defaultServerUrl();
    }
  });

  const [transferCode, setTransferCode] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const fileInputRef = useRef(null);
  const transferRef = useRef(null);

  // Sync mode changes to localStorage
  function changeMode(newMode) {
    setMode(newMode);
    try {
      localStorage.setItem("origin_mode", newMode);
    } catch {}
  }

  // Sync serverUrl changes to localStorage
  function changeServerUrl(newUrl) {
    setServerUrl(newUrl);
    try {
      localStorage.setItem("origin_server_url", newUrl);
    } catch {}
  }

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

  function connectAsReceiver(overrideCode) {
    const codeToUse = overrideCode !== undefined ? overrideCode : connectCode;
    const parsed = parseTransferPayload(codeToUse);
    if (!parsed.code) {
      setToast("Enter or scan a transfer code.");
      return;
    }

    if (parsed.serverUrl && parsed.serverUrl !== serverUrl) {
      changeServerUrl(parsed.serverUrl);
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
        // No auto-download: user stays in complete control
        const fileId = crypto.randomUUID();
        const fileRecord = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          blob: file.blob,
          receivedAt: new Date(),
        };

        setReceived((current) => [fileRecord, ...current]);
        setSelectedIds((current) => new Set([...current, fileId]));
        setToast(`Received "${file.name}" · Ready to download`);
      },
    });

    transfer.connect();
    transferRef.current = transfer;
  }

  function handleQrScan(scannedData) {
    setIsScannerOpen(false);
    setConnectCode(scannedData);
    setToast("QR code scanned successfully! Connecting...");
    connectAsReceiver(scannedData);
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

  // Selection handlers for received files
  function toggleSelectFile(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === received.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(received.map((f) => f.id)));
    }
  }

  async function downloadSelectedZip() {
    const selectedFiles = received.filter((f) => selectedIds.has(f.id));
    if (!selectedFiles.length) {
      setToast("Select at least one file to download.");
      return;
    }

    setIsZipping(true);
    try {
      await downloadFilesAsZip(selectedFiles, "Origin_Files");
      setToast(`Downloaded ${selectedFiles.length} file(s) in ZIP folder.`);
    } catch (err) {
      console.error(err);
      setToast("Failed to create ZIP package.");
    } finally {
      setIsZipping(false);
    }
  }

  function clearReceived() {
    setReceived([]);
    setSelectedIds(new Set());
  }

  const qrPayload = transferCode
    ? encodeTransferPayload({ code: transferCode, serverUrl: normalizeServerUrl(serverUrl) })
    : "";

  return (
    <main className="app-shell">
      <div className="aurora" />
      <section className="phone-stage">
        <header className="topbar">
          <span className="brand-mark">
            <Smartphone size={20} />
            <strong>Origin</strong>
          </span>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === "sender" ? "active" : ""}`}
              onClick={() => changeMode("sender")}
            >
              Sender
            </button>
            <button
              className={`mode-btn ${mode === "receiver" ? "active" : ""}`}
              onClick={() => changeMode("receiver")}
            >
              Receiver
            </button>
          </div>
        </header>

        {mode === "sender" ? (
          <section className="upload-sheet glass">
            <div className="sheet-head">
              <div>
                <strong>Sender</strong>
                <span className="status-label">Status: {formatStatusDescription(status, "sender")}</span>
              </div>
              <button className="icon-button quiet" onClick={connectAsSender} title="Generate new code">
                <RefreshCcw size={18} />
              </button>
            </div>

            {transferCode && (
              <div className="transfer-code-box">
                <div className="code-display">
                  <span>TRANSFER CODE</span>
                  <strong>{transferCode}</strong>
                </div>
                <div className="qr-wrap">
                  <QRCodeSVG value={qrPayload} size={148} bgColor="transparent" fgColor="#F7F7FB" />
                </div>
                <span className="qr-hint">Scan with receiver camera or enter code manually.</span>
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
                <Plus size={26} />
              </span>
              Select photos or videos
            </button>

            {queue.length > 0 && (
              <div className="queue-section">
                <div className="preview-strip">
                  {queue.map((entry) => (
                    <QueuedFile key={entry.id} entry={entry} />
                  ))}
                </div>
                <div className="queue-summary">
                  <span>{queue.length} files · {formatBytes(totalBytes)}</span>
                  <button className="icon-button quiet" onClick={clearQueue} title="Clear queue">
                    <X size={17} />
                  </button>
                </div>
              </div>
            )}

            {progress > 0 && (
              <div className="total-bar">
                <span style={{ width: `${progress}%` }} />
              </div>
            )}

            <button
              className="primary-button"
              onClick={sendQueuedFiles}
              disabled={isSending || status !== "ready" || queue.length === 0}
            >
              {isSending ? <Loader2 className="spin" size={19} /> : <Send size={19} />}
              {isSending ? `Sending ${progress}%` : "Send files"}
            </button>
          </section>
        ) : (
          <section className="upload-sheet glass">
            <div className="sheet-head">
              <div>
                <strong>Receiver</strong>
                <span className="status-label">Status: {formatStatusDescription(status, "receiver")}</span>
              </div>
              <button
                className="scan-qr-btn"
                onClick={() => setIsScannerOpen(true)}
                title="Scan QR code from sender screen"
              >
                <ScanLine size={17} />
                <span>Scan QR</span>
              </button>
            </div>

            <div className="receiver-input-group">
              <div className="input-with-button">
                <input
                  className="server-input"
                  value={connectCode}
                  onChange={(event) => setConnectCode(event.target.value)}
                  placeholder="Enter code or paste payload"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") connectAsReceiver();
                  }}
                />
                <button
                  className="qr-input-btn"
                  onClick={() => setIsScannerOpen(true)}
                  title="Open camera to scan QR"
                >
                  <QrCode size={20} />
                </button>
              </div>

              <button
                className="primary-button"
                onClick={() => connectAsReceiver()}
                disabled={status === "connecting"}
              >
                {status === "connecting" ? (
                  <>
                    <Loader2 className="spin" size={19} /> Connecting...
                  </>
                ) : (
                  "Connect to sender"
                )}
              </button>
            </div>

            {progress > 0 && (
              <div className="total-bar">
                <span style={{ width: `${progress}%` }} />
              </div>
            )}

            <section className="inbox">
              <div className="inbox-header">
                <div>
                  <span className="eyebrow">Received Files</span>
                  <h2>{transferName()}</h2>
                </div>
                {received.length > 0 && (
                  <div className="inbox-actions">
                    <button
                      className="bulk-button text-btn"
                      onClick={toggleSelectAll}
                    >
                      {selectedIds.size === received.length ? (
                        <>
                          <CheckSquare size={16} /> Deselect All
                        </>
                      ) : (
                        <>
                          <Square size={16} /> Select All
                        </>
                      )}
                    </button>
                    <button
                      className="icon-button quiet"
                      onClick={clearReceived}
                      title="Clear received list"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {received.length > 0 && (
                <div className="download-controls glass">
                  <div className="selection-stats">
                    <span className="count-pill">
                      {selectedIds.size} / {received.length} selected
                    </span>
                  </div>
                  <button
                    className="bulk-zip-btn"
                    onClick={downloadSelectedZip}
                    disabled={isZipping || selectedIds.size === 0}
                  >
                    {isZipping ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <FileArchive size={17} />
                    )}
                    {isZipping ? "Packaging ZIP..." : `Download ZIP (${selectedIds.size})`}
                  </button>
                </div>
              )}

              <div className="file-list">
                {received.map((item) => (
                  <ReceivedFileCard
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelectFile(item.id)}
                  />
                ))}
                {!received.length && (
                  <div className="empty-state">
                    <Image size={38} />
                    <strong>No files received yet</strong>
                    <span>
                      Connect to a sender to transfer photos & videos directly over LAN.
                    </span>
                  </div>
                )}
              </div>
            </section>
          </section>
        )}
      </section>

      {/* QR Camera Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleQrScan}
      />

      {/* Toast Notification */}
      <AnimatePresence>
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
      </AnimatePresence>
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

function ReceivedFileCard({ item, isSelected, onToggleSelect }) {
  const isVideo = item.type?.startsWith("video/");
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!item.blob) return;
    const url = URL.createObjectURL(item.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.blob]);

  return (
    <article className={`file-card glass ${isSelected ? "selected" : ""}`}>
      <button
        type="button"
        className="select-hit"
        onClick={onToggleSelect}
        title={isSelected ? "Deselect file" : "Select file"}
      >
        <span className={`checkbox ${isSelected ? "checked" : ""}`}>
          {isSelected && <Check size={14} />}
        </span>
      </button>

      <div className="thumb">
        {objectUrl ? (
          isVideo ? (
            <video src={objectUrl} muted playsInline />
          ) : (
            <img src={objectUrl} alt={item.name} />
          )
        ) : isVideo ? (
          <Video size={22} />
        ) : (
          <Image size={22} />
        )}
      </div>

      <div className="file-copy" onClick={onToggleSelect}>
        <strong>{item.name}</strong>
        <span>{formatBytes(item.size)}</span>
      </div>

      <button
        type="button"
        className="icon-button download-single"
        onClick={(e) => {
          e.stopPropagation();
          triggerDownload(item.blob, item.name);
        }}
        title="Download individual file"
      >
        <Download size={18} />
      </button>
    </article>
  );
}
