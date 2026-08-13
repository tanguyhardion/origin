export function formatStatusDescription(status, mode) {
  switch (status) {
    case "idle":
      return "Idle";
    case "waiting-for-receiver":
      return "Waiting for receiver...";
    case "connected-to-signaling":
      return mode === "receiver"
        ? "Connected to signaling"
        : "Signaling active · Waiting for receiver";
    case "connecting":
      return mode === "receiver"
        ? "Connecting to sender (Direct LAN)..."
        : "Connecting P2P (Direct LAN)...";
    case "connected":
      return "LAN connected · Initializing channel...";
    case "ready":
      return "Ready (Direct LAN)";
    case "channel-closed":
      return "Channel closed";
    case "disconnected":
      return "Disconnected";
    case "failed":
      return "Connection failed";
    default:
      return status;
  }
}
