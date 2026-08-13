import { QRCodeSVG } from "qrcode.react";
import { encodeTransferPayload } from "../../transferCode";
import { normalizeServerUrl } from "../../utils";

export default function TransferCodeBox({ transferCode, serverUrl }) {
  if (!transferCode) return null;

  const qrPayload = encodeTransferPayload({
    code: transferCode,
    serverUrl: normalizeServerUrl(serverUrl),
  });

  return (
    <div className="transfer-code-box">
      <div className="code-display">
        <span>TRANSFER CODE</span>
        <strong>{transferCode}</strong>
      </div>
      <div className="qr-wrap">
        <QRCodeSVG
          value={qrPayload}
          size={160}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="M"
        />
      </div>
      <span className="qr-hint">
        Scan with receiver camera or enter code manually.
      </span>
    </div>
  );
}
