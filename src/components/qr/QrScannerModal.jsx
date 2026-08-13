import { Camera, CameraOff, RefreshCw, X } from "lucide-react";
import { useQrScanner } from "./useQrScanner";

export default function QrScannerModal({ isOpen, onClose, onScan }) {
  const {
    videoRef,
    canvasRef,
    error,
    hasMultipleCameras,
    startCamera,
    toggleCamera,
  } = useQrScanner({ isOpen, onScan });

  if (!isOpen) return null;

  return (
    <div className="qr-scanner-overlay" onClick={onClose}>
      <div className="qr-scanner-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <div className="scanner-title">
            <Camera size={18} />
            <span>Scan Sender QR Code</span>
          </div>
          <div className="scanner-header-actions">
            {hasMultipleCameras && (
              <button
                className="icon-button quiet"
                onClick={toggleCamera}
                title="Switch camera"
              >
                <RefreshCw size={17} />
              </button>
            )}
            <button
              className="icon-button quiet"
              onClick={onClose}
              title="Close scanner"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="scanner-viewfinder-container">
          {error ? (
            <div className="scanner-error">
              <CameraOff size={36} />
              <strong>Camera Unavailable</strong>
              <p>{error}</p>
              <button className="bulk-button" onClick={startCamera}>
                Try Again
              </button>
            </div>
          ) : (
            <div className="scanner-viewport">
              <video
                ref={videoRef}
                className="scanner-video"
                muted
                playsInline
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />
              <div className="scanner-target">
                <div className="target-corner top-left" />
                <div className="target-corner top-right" />
                <div className="target-corner bottom-left" />
                <div className="target-corner bottom-right" />
                <div className="scanner-laser" />
              </div>
            </div>
          )}
        </div>

        <p className="scanner-hint">
          Point camera at the QR code displayed on the sender's screen.
        </p>
      </div>
    </div>
  );
}
