import { X } from "lucide-react";
import { formatBytes } from "../../utils";
import QueuedFileCard from "./QueuedFileCard";

export default function QueueSection({ queue, totalBytes, onClear }) {
  if (!queue.length) return null;

  return (
    <div className="queue-section">
      <div className="preview-strip">
        {queue.map((entry) => (
          <QueuedFileCard key={entry.id} entry={entry} />
        ))}
      </div>
      <div className="queue-summary">
        <span>
          {queue.length} files · {formatBytes(totalBytes)}
        </span>
        <button className="icon-button quiet" onClick={onClear} title="Clear queue">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
