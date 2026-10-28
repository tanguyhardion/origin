import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";

const SCAN_INTERVAL_MS = 80;
const MAX_SCAN_SIZE = 720;

export function useQrScanner({ isOpen, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastScanRef = useRef(0);
  const frameCountRef = useRef(0);
  const detectorRef = useRef(null);

  const [error, setError] = useState("");
  const [facingMode, setFacingMode] = useState("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopCamera = useCallback(() => {
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
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const schedule = () => {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    const now = performance.now();
    const ready =
      video.readyState === video.HAVE_ENOUGH_DATA &&
      video.videoWidth > 0 &&
      now - lastScanRef.current >= SCAN_INTERVAL_MS;

    if (!ready) {
      schedule();
      return;
    }
    lastScanRef.current = now;

    const finish = (data) => {
      try {
        if (navigator.vibrate) navigator.vibrate(100);
      } catch {}
      stopCamera();
      onScan(data);
    };

    // Downscale so jsQR stays fast and the main thread (and laser animation) stays free.
    const scale = Math.min(1, MAX_SCAN_SIZE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      schedule();
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const detector = detectorRef.current;
    if (detector) {
      detector
        .detect(canvas)
        .then((codes) => {
          const value = codes.find((c) => c.rawValue)?.rawValue;
          if (value) finish(value);
          else schedule();
        })
        .catch(() => {
          detectorRef.current = null;
          schedule();
        });
      return;
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    frameCountRef.current += 1;
    const code = jsQR(imageData.data, width, height, {
      inversionAttempts: frameCountRef.current % 3 === 0 ? "attemptBoth" : "dontInvert",
    });
    if (code && code.data) {
      finish(code.data);
      return;
    }
    schedule();
  }, [onScan, stopCamera]);

  const startCamera = useCallback(async () => {
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      // Ask for continuous autofocus where supported; ignored otherwise.
      const [track] = stream.getVideoTracks();
      try {
        const caps = track.getCapabilities?.() || {};
        if (caps.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch {}

      if (!detectorRef.current && "BarcodeDetector" in window) {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {}
      }
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
  }, [facingMode, scanFrame, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          setHasMultipleCameras(videoDevices.length > 1);
        })
        .catch(() => {});
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  return {
    videoRef,
    canvasRef,
    error,
    hasMultipleCameras,
    startCamera,
    toggleCamera,
  };
}
