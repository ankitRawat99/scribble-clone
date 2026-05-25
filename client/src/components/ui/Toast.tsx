import { useCallback, useEffect, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "info" | "error";
}

let toastIdCounter = 0;
type ToastListener = (toast: ToastItem) => void;
const listeners = new Set<ToastListener>();

/**
 * Programmatic toast API — call from anywhere without prop drilling.
 * This singleton pattern avoids needing a Context provider.
 */
export const toast = {
  success: (message: string) => emit({ id: ++toastIdCounter, message, type: "success" }),
  info: (message: string) => emit({ id: ++toastIdCounter, message, type: "info" }),
  error: (message: string) => emit({ id: ++toastIdCounter, message, type: "error" }),
};

function emit(item: ToastItem) {
  listeners.forEach((fn) => fn(item));
}

/**
 * ToastContainer — Mount this once at the app root.
 * Toasts auto-dismiss after 3 seconds with a fade-out animation.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const handler: ToastListener = (item) => {
      setToasts((prev) => [...prev.slice(-4), item]); // max 5 toasts
      const timer = setTimeout(() => dismiss(item.id), 3000);
      timers.current.set(item.id, timer);
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      timers.current.forEach(clearTimeout);
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="log" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
          </span>
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
