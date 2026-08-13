import { useState, useEffect, useCallback } from "react";

export function useToast(autoDismissMs = 3500) {
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast("");
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [toast, autoDismissMs]);

  const showToast = useCallback((message) => {
    setToast(message);
  }, []);

  const clearToast = useCallback(() => {
    setToast("");
  }, []);

  return { toast, showToast, clearToast };
}
