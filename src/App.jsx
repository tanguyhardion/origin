import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Cloud,
  Download,
  FileArchive,
  Image,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { BUCKET, hasSupabaseConfig, supabase } from "./supabase";
import { formatBytes, timeRemaining, transferName, triggerDownload, uniquePath } from "./utils";

const EXPIRY_MINUTES = 15;

export default function App() {
  const [queue, setQueue] = useState([]);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [setupWarning, setSetupWarning] = useState("");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef(null);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected]
  );

  const allItemsSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  const loadItems = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("origin_files")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      setSetupWarning(error.message);
      setItems([]);
    } else {
      setSetupWarning("");
      const rows = data || [];
      const withPreviews = await Promise.all(
        rows.map(async (item) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(item.storage_path, 60 * 60);
          return {
            ...item,
            preview_url:
              signed?.signedUrl ||
              supabase.storage.from(BUCKET).getPublicUrl(item.storage_path).data.publicUrl,
          };
        })
      );
      setItems(withPreviews);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
    const timer = setInterval(loadItems, 20000);
    const tick = setInterval(() => setItems((current) => [...current]), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [loadItems]);

  useEffect(() => {
    return () => queue.forEach((file) => URL.revokeObjectURL(file.previewUrl));
  }, [queue]);

  function addFiles(files) {
    const next = Array.from(files || []).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );
    if (!next.length) return;
    setQueue((current) => [
      ...current,
      ...next.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "ready",
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  async function uploadQueue() {
    if (!hasSupabaseConfig) {
      setToast("Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE to .env first.");
      return;
    }
    if (!queue.length || isUploading) return;

    setIsUploading(true);
    const sessionId = crypto.randomUUID();
    const sessionName = transferName();
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60000).toISOString();

    for (const entry of queue) {
      const storagePath = uniquePath(sessionId, entry.file);
      setQueue((current) =>
        current.map((file) =>
          file.id === entry.id ? { ...file, status: "uploading", progress: 18 } : file
        )
      );

      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, entry.file, {
        contentType: entry.file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        setQueue((current) =>
          current.map((file) =>
            file.id === entry.id ? { ...file, status: "error", progress: 0 } : file
          )
        );
        setToast(error.message);
        continue;
      }

      setQueue((current) =>
        current.map((file) =>
          file.id === entry.id ? { ...file, status: "saving", progress: 82 } : file
        )
      );

      const { error: dbError } = await supabase.from("origin_files").insert({
        session_id: sessionId,
        session_name: sessionName,
        bucket: BUCKET,
        storage_path: storagePath,
        file_name: entry.file.name,
        mime_type: entry.file.type || "application/octet-stream",
        file_size: entry.file.size,
        expires_at: expiresAt,
      });

      setQueue((current) =>
        current.map((file) =>
          file.id === entry.id
            ? { ...file, status: dbError ? "error" : "done", progress: dbError ? 0 : 100 }
            : file
        )
      );
      if (dbError) setToast(dbError.message);
    }

    setIsUploading(false);
    setTimeout(() => setQueue((current) => current.filter((file) => file.status !== "done")), 900);
    loadItems();
  }

  async function downloadSelected(targets = selectedItems) {
    if (!targets.length || downloading) return;
    setDownloading(true);

    try {
      if (targets.length === 1) {
        const item = targets[0];
        const { data, error } = await supabase.storage.from(BUCKET).download(item.storage_path);
        if (error) throw error;
        triggerDownload(data, item.file_name);
      } else {
        const { default: JSZip } = await import("jszip");
        const folder = targets[0]?.session_name || transferName();
        const zip = new JSZip();
        const root = zip.folder(folder);
        for (const item of targets) {
          const { data, error } = await supabase.storage.from(BUCKET).download(item.storage_path);
          if (error) throw error;
          root.file(item.file_name, data);
        }
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        triggerDownload(blob, `${folder}.zip`);
      }

      const downloadedAt = new Date().toISOString();
      const { error: markError } = await supabase
        .from("origin_files")
        .update({ downloaded_at: downloadedAt })
        .in("id", targets.map((item) => item.id));
      if (markError) throw markError;

      const { error: cleanupError } = await supabase.functions.invoke("delete-transfers", {
        body: { ids: targets.map((item) => item.id) },
      });
      if (cleanupError) throw cleanupError;

      setSelected(new Set());
      loadItems();
    } catch (error) {
      setToast(error.message || "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  function toggleSelected(id) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allItemsSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  const totalProgress = queue.length
    ? Math.round(queue.reduce((sum, file) => sum + file.progress, 0) / queue.length)
    : 0;

  return (
    <main className="app-shell">
      <div className="aurora" />
      <section className="phone-stage">
        <header className="topbar">
          <span className="brand-mark">
            <Cloud size={18} />
            <strong>Origin</strong>
          </span>
        </header>

        <motion.section className="drop-zone" whileTap={{ scale: 0.985 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(event) => addFiles(event.target.files)}
          />
          <button className="add-button" onClick={() => fileInputRef.current?.click()}>
            <span>
              <Plus size={30} />
            </span>
            Select photos or videos
          </button>
          <p>Original bytes only. No compression, no edits, no metadata stripping.</p>
          <div className="trust-row">
            <span>
              <ShieldCheck size={15} /> EXIF preserved
            </span>
            <span>
              <Video size={15} /> Full bitrate
            </span>
          </div>
        </motion.section>

        <AnimatePresence>
          {queue.length > 0 && (
            <motion.section
              className="upload-sheet glass"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
            >
              <div className="sheet-head">
                <div>
                  <strong>{queue.length} ready to send</strong>
                  <span>Total progress {totalProgress}%</span>
                </div>
                <button className="icon-button quiet" onClick={() => setQueue([])}>
                  <X size={18} />
                </button>
              </div>
              <div className="total-bar">
                <span style={{ width: `${totalProgress}%` }} />
              </div>
              <div className="preview-strip">
                {queue.map((entry) => (
                  <QueuedFile key={entry.id} entry={entry} />
                ))}
              </div>
              <button className="primary-button" onClick={uploadQueue} disabled={isUploading}>
                {isUploading ? <Loader2 className="spin" size={19} /> : <UploadCloud size={20} />}
                {isUploading ? "Sending originals" : "Upload originals"}
              </button>
            </motion.section>
          )}
        </AnimatePresence>

        <section className="inbox">
          <div className="section-title">
            <div>
              <span className="eyebrow">Inbox</span>
              <h2>Recent uploads</h2>
            </div>
            <div className="section-actions">
              <button className="bulk-button quiet" onClick={toggleSelectAll} disabled={!items.length}>
                {allItemsSelected ? "Clear all" : "Select all"}
              </button>
              <button className="icon-button quiet" onClick={loadItems} title="Refresh">
                {isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
              </button>
            </div>
          </div>

          {(!hasSupabaseConfig || setupWarning) && <Notice message={setupWarning} />}

          <div className="file-list">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <FileCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  onToggle={() => toggleSelected(item.id)}
                  onDownload={() => downloadSelected([item])}
                />
              ))}
            </AnimatePresence>
            {hasSupabaseConfig && !setupWarning && !items.length && (
              <div className="empty-state">
                <Image size={38} />
                <strong>No live transfers</strong>
                <span>Files appear here instantly after upload and expire in 15 minutes.</span>
              </div>
            )}
          </div>
        </section>
      </section>

      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            className="action-dock glass"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
          >
            <button className="icon-button quiet" onClick={() => setSelected(new Set())}>
              <X size={18} />
            </button>
            <div>
              <strong>{selectedItems.length} selected</strong>
              <span>{selectedItems.length > 1 ? "ZIP folder will be created" : "Direct original download"}</span>
            </div>
            <button className="dock-action" onClick={() => downloadSelected()} disabled={downloading}>
              {downloading ? (
                <Loader2 className="spin" size={18} />
              ) : selectedItems.length > 1 ? (
                <FileArchive size={18} />
              ) : (
                <Download size={18} />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
  const isVideo = entry.type.startsWith("video/");
  return (
    <article className="queue-card">
      {isVideo ? <video src={entry.previewUrl} muted playsInline /> : <img src={entry.previewUrl} alt="" />}
      <div className="queue-meta">
        <span>
          {isVideo ? <Play size={13} /> : <Image size={13} />} {entry.name}
        </span>
        <small>{formatBytes(entry.size)}</small>
      </div>
      <div className="mini-bar">
        <span style={{ width: `${entry.progress}%` }} />
      </div>
    </article>
  );
}

function FileCard({ item, selected, onToggle, onDownload }) {
  const isVideo = item.mime_type?.startsWith("video/");
  const signedUrl = item.preview_url;

  return (
    <motion.article
      className={`file-card glass ${selected ? "selected" : ""}`}
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileTap={{ scale: 0.985 }}
    >
      <button className="select-hit" onClick={onToggle} aria-label="Select file">
        <span>{selected && <Check size={14} />}</span>
      </button>
      <button className="thumb" onClick={onDownload} aria-label="Download file">
        {signedUrl && !isVideo && <img loading="lazy" src={signedUrl} alt="" />}
        {signedUrl && isVideo && <video preload="metadata" src={signedUrl} muted playsInline />}
        {!signedUrl && (isVideo ? <Video size={24} /> : <Image size={24} />)}
        {isVideo && (
          <i>
            <Play size={15} />
          </i>
        )}
      </button>
      <button className="file-copy" onClick={onDownload}>
        <strong>{item.file_name}</strong>
        <span>{formatBytes(item.file_size)} / {timeRemaining(item.expires_at)} left</span>
      </button>
      <button className="icon-button download" onClick={onDownload} title="Download">
        <Download size={18} />
      </button>
    </motion.article>
  );
}

function Notice({ message }) {
  return (
    <div className="notice glass">
      <Trash2 size={18} />
      {message || "Add public Supabase env vars, create the bucket/table, then refresh."}
    </div>
  );
}
