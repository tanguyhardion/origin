import { Image, Video } from "lucide-react";
import { formatBytes } from "../../utils";

export default function QueuedFileCard({ entry }) {
  const isVideo = entry.file.type.startsWith("video/");
  return (
    <article className="queue-card">
      {isVideo ? (
        <video src={entry.previewUrl} muted playsInline />
      ) : (
        <img src={entry.previewUrl} alt="" />
      )}
      <div className="queue-meta">
        <span>
          {isVideo ? <Video size={13} /> : <Image size={13} />} {entry.file.name}
        </span>
        <small>{formatBytes(entry.file.size)}</small>
      </div>
    </article>
  );
}
