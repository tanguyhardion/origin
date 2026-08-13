import { Loader2, QrCode } from "lucide-react";

export default function ReceiverInputGroup({
  connectCode,
  status,
  onChangeConnectCode,
  onConnect,
  onOpenScanner,
}) {
  return (
    <div className="receiver-input-group">
      <div className="input-with-button">
        <input
          className="server-input"
          value={connectCode}
          onChange={(event) => onChangeConnectCode(event.target.value)}
          placeholder="Enter code or paste payload"
          onKeyDown={(e) => {
            if (e.key === "Enter") onConnect();
          }}
        />
        <button
          type="button"
          className="qr-input-btn"
          onClick={onOpenScanner}
          title="Open camera to scan QR"
        >
          <QrCode size={20} />
        </button>
      </div>

      <button
        type="button"
        className="primary-button"
        onClick={() => onConnect()}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? (
          <>
            <Loader2 className="spin" size={19} /> Connecting...
          </>
        ) : (
          "Connect to sender"
        )}
      </button>
    </div>
  );
}
