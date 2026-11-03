import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

const STYLES: Record<ToastKind, { bar: string; icon: string }> = {
  success: { bar: 'bg-[#3ddc84]', icon: '✓' },
  error: { bar: 'bg-[#ff5b7f]', icon: '!' },
  info: { bar: 'bg-cyan', icon: 'i' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-5 z-[120] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-stretch border-2 border-line bg-[#15151f] text-sm text-white shadow-pixel animate-popin"
          >
            <div className={`w-1.5 ${STYLES[t.kind].bar}`} />
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-white/25 text-[11px] font-black leading-none">
                {STYLES[t.kind].icon}
              </span>
              <span className="leading-snug">{t.message}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
