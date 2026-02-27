// app/components/Toaster.tsx
"use client";
import React, { useEffect, useState } from "react";

export type ToastType = "info" | "success" | "error" | "loading";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin flex-shrink-0"
      aria-hidden
    />
  );
}

const STYLES: Record<ToastType, string> = {
  info:    "bg-slate-800 text-white",
  success: "bg-green-600 text-white",
  error:   "bg-red-600 text-white",
  loading: "bg-indigo-600 text-white",
};

const ICONS: Record<Exclude<ToastType, "loading">, string> = {
  info:    "ℹ",
  success: "✓",
  error:   "✕",
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  // Trigger enter animation on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm max-w-xs w-full
        transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
        ${STYLES[toast.type]}
      `}
    >
      {toast.type === "loading" ? (
        <Spinner />
      ) : (
        <span className="font-bold flex-shrink-0">{ICONS[toast.type]}</span>
      )}

      <span className="flex-1 leading-snug">{toast.message}</span>

      {toast.type !== "loading" && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col-reverse gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
