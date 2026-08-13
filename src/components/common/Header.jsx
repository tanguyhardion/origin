import { Smartphone } from "lucide-react";
import { motion } from "framer-motion";

export default function Header({ mode, onModeChange }) {
  return (
    <header className="topbar">
      <span className="brand-mark">
        <Smartphone size={20} />
        <strong>Origin</strong>
      </span>
      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === "sender" ? "active" : ""}`}
          onClick={() => onModeChange("sender")}
        >
          {mode === "sender" && (
            <motion.div
              layoutId="active-mode-pill"
              className="mode-pill-bg"
              transition={{ type: "spring", stiffness: 450, damping: 35 }}
            />
          )}
          <span className="mode-btn-text">Sender</span>
        </button>
        <button
          className={`mode-btn ${mode === "receiver" ? "active" : ""}`}
          onClick={() => onModeChange("receiver")}
        >
          {mode === "receiver" && (
            <motion.div
              layoutId="active-mode-pill"
              className="mode-pill-bg"
              transition={{ type: "spring", stiffness: 450, damping: 35 }}
            />
          )}
          <span className="mode-btn-text">Receiver</span>
        </button>
      </div>
    </header>
  );
}
