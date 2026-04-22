import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  push: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DEFAULT_DURATION);
  }, []);

  const value: ToastContextValue = {
    push,
    success: msg => push(msg, 'success'),
    error: msg => push(msg, 'error'),
    info: msg => push(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastCard key={t.id} item={t} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const colors: Record<ToastType, string> = {
    success: 'border-emerald-500/60 bg-emerald-900/80 text-emerald-100',
    error: 'border-red-500/60 bg-red-900/80 text-red-100',
    info: 'border-ink-500/60 bg-ink-800/90 text-ink-100',
  };
  const icons: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ⓘ' };

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`pointer-events-auto min-w-[220px] max-w-[360px] rounded-md border px-3 py-2 text-sm shadow-lg
        backdrop-blur transition-all duration-200 flex items-start gap-2
        ${colors[item.type]}
        ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
      <span className="font-semibold leading-5 shrink-0">{icons[item.type]}</span>
      <span className="flex-1 whitespace-pre-wrap break-words leading-5">{item.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 text-current opacity-60 hover:opacity-100 shrink-0"
        aria-label="关闭">
        ×
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
