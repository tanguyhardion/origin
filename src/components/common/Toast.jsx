import { motion, AnimatePresence } from "framer-motion";

export default function Toast({ toast, onDismiss }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.button
          className="toast"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={onDismiss}
        >
          {toast}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
