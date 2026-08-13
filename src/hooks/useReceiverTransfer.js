import { useState, useRef, useEffect, useCallback } from "react";
import { P2PTransfer } from "../p2p";
import { parseTransferPayload } from "../transferCode";
import { downloadFilesAsZip, normalizeServerUrl } from "../utils";

export function useReceiverTransfer({ serverUrl, onServerUrlChange, onToast }) {
  const [connectCode, setConnectCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [isZipping, setIsZipping] = useState(false);
  const [received, setReceived] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const transferRef = useRef(null);

  const cleanup = useCallback(() => {
    transferRef.current?.destroy();
    transferRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const connectAsReceiver = useCallback(
    (overrideCode) => {
      const codeToUse = overrideCode !== undefined ? overrideCode : connectCode;
      const parsed = parseTransferPayload(codeToUse);
      if (!parsed.code) {
        onToast?.("Enter or scan a transfer code.");
        return;
      }

      if (parsed.serverUrl && parsed.serverUrl !== serverUrl) {
        onServerUrlChange?.(parsed.serverUrl);
      }

      cleanup();
      setStatus("connecting");
      setProgress(0);

      const activeServerUrl = normalizeServerUrl(parsed.serverUrl || serverUrl);

      const transfer = new P2PTransfer({
        code: parsed.code,
        role: "receiver",
        serverUrl: activeServerUrl,
        onStatus: setStatus,
        onError: (message) => onToast?.(message),
        onProgress: ({ percent }) => setProgress(percent),
        onFile: (file) => {
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
          onToast?.(`Received "${file.name}" · Ready to download`);
        },
      });

      transfer.connect();
      transferRef.current = transfer;
    },
    [connectCode, serverUrl, cleanup, onServerUrlChange, onToast]
  );

  const toggleSelectFile = useCallback((id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) => {
      if (current.size === received.length) {
        return new Set();
      }
      return new Set(received.map((f) => f.id));
    });
  }, [received]);

  const downloadSelectedZip = useCallback(async () => {
    const selectedFiles = received.filter((f) => selectedIds.has(f.id));
    if (!selectedFiles.length) {
      onToast?.("Select at least one file to download.");
      return;
    }

    setIsZipping(true);
    try {
      await downloadFilesAsZip(selectedFiles, "Origin_Files");
      onToast?.(`Downloaded ${selectedFiles.length} file(s) in ZIP folder.`);
    } catch (err) {
      console.error(err);
      onToast?.("Failed to create ZIP package.");
    } finally {
      setIsZipping(false);
    }
  }, [received, selectedIds, onToast]);

  const clearReceived = useCallback(() => {
    setReceived([]);
    setSelectedIds(new Set());
  }, []);

  return {
    connectCode,
    setConnectCode,
    status,
    setStatus,
    progress,
    isZipping,
    received,
    selectedIds,
    connectAsReceiver,
    toggleSelectFile,
    toggleSelectAll,
    downloadSelectedZip,
    clearReceived,
    cleanup,
  };
}
