import { useRef } from "react";
import { Loader2, Plus, RefreshCcw, Send } from "lucide-react";
import { formatStatusDescription } from "../../constants/status";
import ProgressBar from "../common/ProgressBar";
import TransferCodeBox from "./TransferCodeBox";
import QueueSection from "./QueueSection";

export default function SenderView({
  serverUrl,
  transferCode,
  status,
  progress,
  isSending,
  queue,
  totalBytes,
  onNewCode,
  onAddFiles,
  onClearQueue,
  onSend,
}) {
  const fileInputRef = useRef(null);

  return (
    <section className="upload-sheet glass">
      <div className="sheet-head">
        <div>
          <strong>Sender</strong>
          <span className="status-label">
            Status: {formatStatusDescription(status, "sender")}
          </span>
        </div>
        <button
          className="icon-button quiet"
          onClick={onNewCode}
          title="Generate new code"
        >
          <RefreshCcw size={18} />
        </button>
      </div>

      <TransferCodeBox transferCode={transferCode} serverUrl={serverUrl} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: "none" }}
        onChange={(event) => onAddFiles(event.target.files)}
      />
      <button className="add-button" onClick={() => fileInputRef.current?.click()}>
        <span>
          <Plus size={26} />
        </span>
        Select photos or videos
      </button>

      <QueueSection
        queue={queue}
        totalBytes={totalBytes}
        onClear={onClearQueue}
      />

      <ProgressBar progress={progress} />

      <button
        className="primary-button"
        onClick={onSend}
        disabled={isSending || status !== "ready" || queue.length === 0}
      >
        {isSending ? <Loader2 className="spin" size={19} /> : <Send size={19} />}
        {isSending ? `Sending ${progress}%` : "Send files"}
      </button>
    </section>
  );
}
