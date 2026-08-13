import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { P2PTransfer } from "../p2p";
import { generateTransferCode } from "../transferCode";
import { normalizeServerUrl } from "../utils";

export function useSenderTransfer({ serverUrl, onToast }) {
  const [transferCode, setTransferCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [queue, setQueue] = useState([]);

  const transferRef = useRef(null);

  const totalBytes = useMemo(
    () => queue.reduce((sum, entry) => sum + entry.file.size, 0),
    [queue]
  );

  const cleanup = useCallback(() => {
    transferRef.current?.destroy();
    transferRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const clearQueue = useCallback(() => {
    setQueue((current) => {
      current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      return [];
    });
  }, []);

  const addFiles = useCallback(
    (files) => {
      const next = Array.from(files || []).filter(
        (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
      );

      if (!next.length) {
        onToast?.("Select photos or videos to transfer.");
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
    },
    [onToast]
  );

  const connectAsSender = useCallback(() => {
    cleanup();
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
      onError: (message) => onToast?.(message),
      onProgress: ({ percent }) => setProgress(percent),
    });

    transfer.connect();
    transferRef.current = transfer;
  }, [serverUrl, cleanup, onToast]);

  const sendQueuedFiles = useCallback(async () => {
    const transfer = transferRef.current;
    if (!transfer) {
      onToast?.("Start a sender session first.");
      return;
    }
    if (!queue.length) {
      onToast?.("No files queued.");
      return;
    }

    setIsSending(true);
    try {
      await transfer.sendFiles(queue.map((entry) => entry.file));
      queue.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      setQueue([]);
      onToast?.("Transfer complete.");
    } catch (error) {
      onToast?.(error.message || "Transfer failed.");
    } finally {
      setIsSending(false);
    }
  }, [queue, onToast]);

  return {
    transferCode,
    status,
    progress,
    isSending,
    queue,
    totalBytes,
    connectAsSender,
    addFiles,
    clearQueue,
    sendQueuedFiles,
    cleanup,
  };
}
