import { CheckSquare, FileArchive, Image, Loader2, Square, Trash2 } from "lucide-react";
import { transferName } from "../../utils";
import ReceivedFileCard from "./ReceivedFileCard";

export default function ReceivedFilesSection({
  received,
  selectedIds,
  isZipping,
  onToggleSelectFile,
  onToggleSelectAll,
  onDownloadSelectedZip,
  onClearReceived,
}) {
  return (
    <section className="inbox">
      <div className="inbox-header">
        <div className="inbox-title-group">
          <span className="eyebrow">Received Files</span>
          <h2>{transferName()}</h2>
        </div>
        {received.length > 0 && (
          <div className="inbox-actions">
            <button
              type="button"
              className="bulk-button text-btn"
              onClick={onToggleSelectAll}
              aria-label={selectedIds.size === received.length ? "Deselect all files" : "Select all files"}
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
              type="button"
              className="icon-button quiet delete-all-btn"
              onClick={onClearReceived}
              title="Clear received list"
              aria-label="Clear received list"
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
            onClick={onDownloadSelectedZip}
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
            onToggleSelect={() => onToggleSelectFile(item.id)}
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
  );
}
