import { useState, useEffect } from "react";
import { Check, Download, File, Image, Video } from "lucide-react";
import { formatBytes, triggerDownload } from "../../utils";

export default function ReceivedFileCard({ item, isSelected, onToggleSelect }) {
  const isVideo = item.type?.startsWith("video/");
  const isImage = item.type?.startsWith("image/");
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
        {objectUrl && isVideo ? (
          <video src={objectUrl} muted playsInline />
        ) : objectUrl && isImage ? (
          <img src={objectUrl} alt={item.name} />
        ) : isVideo ? (
          <Video size={22} />
        ) : isImage ? (
          <Image size={22} />
        ) : (
          <File size={22} />
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
