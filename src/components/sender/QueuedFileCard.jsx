import { File, Image, Video } from "lucide-react";
import { formatBytes } from "../../utils";

export default function QueuedFileCard({ entry }) {
  const isVideo = entry.file.type.startsWith("video/");
  const isImage = entry.file.type.startsWith("image/");
  const Icon = isVideo ? Video : isImage ? Image : File;
  return (
    <article className="queue-card">
      {isVideo ? (
        <video src={entry.previewUrl} muted playsInline />
      ) : isImage ? (
        <img src={entry.previewUrl} alt="" />
      ) : (
        <div className="queue-file-icon">
          <File size={42} />
        </div>
      )}
      <div className="queue-meta">
        <span>
          <Icon size={13} /> {entry.file.name}
        </span>
        <small>{formatBytes(entry.file.size)}</small>
      </div>
    </article>
  );
}
