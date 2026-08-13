import JSZip from "jszip";

export function normalizeServerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let url = rawUrl.trim();
  if (!url) return "";

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";

  if (url.startsWith("http://")) {
    url = "ws://" + url.slice(7);
  } else if (url.startsWith("https://")) {
    url = "wss://" + url.slice(8);
  } else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    url = (isHttps ? "wss://" : "ws://") + url;
  }

  if (isHttps && url.startsWith("ws://")) {
    url = "wss://" + url.slice(5);
  }

  return url;
}

export function defaultServerUrl() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SIGNALING_SERVER) {
    return normalizeServerUrl(import.meta.env.VITE_SIGNALING_SERVER);
  }

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const scheme = isHttps ? "wss" : "ws";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  const host = isLocalHost ? hostname : "localhost";
  return `${scheme}://${host}:3001`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function timeRemaining(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function transferName(date = new Date()) {
  return `Origin_Transfer_${date.toISOString().slice(0, 10)}`;
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFilesAsZip(items, folderPrefix = "Origin_Files") {
  if (!items || items.length === 0) return;
  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `${folderPrefix}_${dateStr}`;
  const folder = zip.folder(folderName);

  const nameCounts = {};
  for (const item of items) {
    let name = item.name || "file";
    if (nameCounts[name]) {
      nameCounts[name]++;
      const dotIndex = name.lastIndexOf(".");
      if (dotIndex !== -1) {
        name = `${name.slice(0, dotIndex)} (${nameCounts[name]})${name.slice(dotIndex)}`;
      } else {
        name = `${name} (${nameCounts[name]})`;
      }
    } else {
      nameCounts[name] = 1;
    }
    folder.file(name, item.blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `${folderName}.zip`);
}


