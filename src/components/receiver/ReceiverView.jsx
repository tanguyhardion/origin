import { ScanLine } from "lucide-react";
import { formatStatusDescription } from "../../constants/status";
import ProgressBar from "../common/ProgressBar";
import ReceiverInputGroup from "./ReceiverInputGroup";
import ReceivedFilesSection from "./ReceivedFilesSection";

export default function ReceiverView({
  connectCode,
  status,
  progress,
  received,
  selectedIds,
  isZipping,
  onChangeConnectCode,
  onConnect,
  onOpenScanner,
  onToggleSelectFile,
  onToggleSelectAll,
  onDownloadSelectedZip,
  onClearReceived,
}) {
  return (
    <section className="upload-sheet glass">
      <div className="sheet-head">
        <div>
          <strong>Receiver</strong>
          <span className="status-label">
            Status: {formatStatusDescription(status, "receiver")}
          </span>
        </div>
        <button
          className="scan-qr-btn"
          onClick={onOpenScanner}
          title="Scan QR code from sender screen"
        >
          <ScanLine size={17} />
          <span>Scan QR</span>
        </button>
      </div>

      <ReceiverInputGroup
        connectCode={connectCode}
        status={status}
        onChangeConnectCode={onChangeConnectCode}
        onConnect={onConnect}
        onOpenScanner={onOpenScanner}
      />

      <ProgressBar progress={progress} />

      <ReceivedFilesSection
        received={received}
        selectedIds={selectedIds}
        isZipping={isZipping}
        onToggleSelectFile={onToggleSelectFile}
        onToggleSelectAll={onToggleSelectAll}
        onDownloadSelectedZip={onDownloadSelectedZip}
        onClearReceived={onClearReceived}
      />
    </section>
  );
}
