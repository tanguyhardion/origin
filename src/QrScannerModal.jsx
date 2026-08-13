import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, X } from "lucide-react";
import jsQR from "jsqr";

export default function QrScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [error, setError] = useState("");
  const [facingMode, setFacingMode] = useState("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    // Check available video devices
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoDevices.length > 1);
      }).catch(() => {});
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  function stopCamera() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    stopCamera();
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported by your browser or requires HTTPS.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        scanFrame();
      }
    } catch (err) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Camera permission was denied. Please allow camera access in browser settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(err.message || "Failed to start camera.");
      }
    }
  }

  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            try {
              if (navigator.vibrate) navigator.vibrate(100);
            } catch {}
            stopCamera();
            onScan(code.data);
            return;
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

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
              <button className="icon-button quiet" onClick={toggleCamera} title="Switch camera">
                <RefreshCw size={17} />
              </button>
            )}
            <button className="icon-button quiet" onClick={onClose} title="Close scanner">
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
              <video ref={videoRef} className="scanner-video" muted playsInline />
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
