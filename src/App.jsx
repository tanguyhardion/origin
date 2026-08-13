import { useEffect, useState } from "react";
import { defaultServerUrl } from "./utils";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useToast } from "./hooks/useToast";
import { useSenderTransfer } from "./hooks/useSenderTransfer";
import { useReceiverTransfer } from "./hooks/useReceiverTransfer";
import Header from "./components/common/Header";
import Toast from "./components/common/Toast";
import SenderView from "./components/sender/SenderView";
import ReceiverView from "./components/receiver/ReceiverView";
import QrScannerModal from "./components/qr/QrScannerModal";

export default function App() {
  const [mode, setMode] = useLocalStorage("origin_mode", "sender");
  const [serverUrl, setServerUrl] = useLocalStorage("origin_server_url", defaultServerUrl);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const { toast, showToast, clearToast } = useToast(3500);

  const sender = useSenderTransfer({
    serverUrl,
    onToast: showToast,
  });

  const receiver = useReceiverTransfer({
    serverUrl,
    onServerUrlChange: setServerUrl,
    onToast: showToast,
  });

  // Switch modes and establish/teardown connections
  useEffect(() => {
    if (mode === "sender") {
      receiver.cleanup();
      sender.connectAsSender();
    } else {
      sender.cleanup();
      receiver.setStatus("idle");
    }
  }, [mode]);

  function handleQrScan(scannedData) {
    setIsScannerOpen(false);
    receiver.setConnectCode(scannedData);
    showToast("QR code scanned successfully! Connecting...");
    receiver.connectAsReceiver(scannedData);
  }

  return (
    <main className="app-shell">
      <div className="aurora" />
      <section className="phone-stage">
        <Header mode={mode} onModeChange={setMode} />

        {mode === "sender" ? (
          <SenderView
            serverUrl={serverUrl}
            transferCode={sender.transferCode}
            status={sender.status}
            progress={sender.progress}
            isSending={sender.isSending}
            queue={sender.queue}
            totalBytes={sender.totalBytes}
            onNewCode={sender.connectAsSender}
            onAddFiles={sender.addFiles}
            onClearQueue={sender.clearQueue}
            onSend={sender.sendQueuedFiles}
          />
        ) : (
          <ReceiverView
            connectCode={receiver.connectCode}
            status={receiver.status}
            progress={receiver.progress}
            received={receiver.received}
            selectedIds={receiver.selectedIds}
            isZipping={receiver.isZipping}
            onChangeConnectCode={receiver.setConnectCode}
            onConnect={receiver.connectAsReceiver}
            onOpenScanner={() => setIsScannerOpen(true)}
            onToggleSelectFile={receiver.toggleSelectFile}
            onToggleSelectAll={receiver.toggleSelectAll}
            onDownloadSelectedZip={receiver.downloadSelectedZip}
            onClearReceived={receiver.clearReceived}
          />
        )}
      </section>

      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleQrScan}
      />

      <Toast toast={toast} onDismiss={clearToast} />
    </main>
  );
}
