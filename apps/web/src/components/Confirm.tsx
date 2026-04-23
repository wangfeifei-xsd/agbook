import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tone = 'default' | 'danger' | 'primary';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

type ConfirmFn = (opts: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

/**
 * Replacement for the native `window.confirm` dialog — Tauri v2 webview
 * blocks/no-ops the built-in one on macOS & Linux, so every delete button
 * that relied on `confirm(...)` silently failed in the desktop build.
 *
 * Mount once at the app root via <ConfirmProvider>. Components call
 * `const confirm = useConfirm(); await confirm({ ... })` and get back a
 * Promise<boolean>.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((input) => {
    const opts: ConfirmOptions =
      typeof input === 'string' ? { message: input } : input;
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    setPending((prev) => {
      prev?.resolve(value);
      return null;
    });
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          {/*
            Flex column with `max-h-[90vh]` clamps the dialog inside the
            viewport; the body gets `flex-1 min-h-0 overflow-auto` so any
            long preview text scrolls inside instead of pushing the header /
            footer off-screen (was causing top=-103px, h=1120px). Header &
            footer stay sticky-looking because they are siblings, not parent.
          */}
          <div className="w-[480px] max-w-[90vw] max-h-[90vh] flex flex-col rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="text-base font-semibold text-ink-100">
                {pending.opts.title ?? '请确认'}
              </div>
            </div>
            <div className="px-5 pb-4 text-sm text-ink-200 whitespace-pre-wrap break-words leading-6 flex-1 min-h-0 overflow-auto scrollbar-thin">
              {pending.opts.message}
            </div>
            <div className="px-5 py-3 border-t border-ink-700 flex justify-end gap-2 bg-ink-900/80 rounded-b-lg shrink-0">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => close(false)}
              >
                {pending.opts.cancelText ?? '取消'}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={`btn ${
                  pending.opts.tone === 'primary' ? 'btn-primary' : 'btn-danger'
                }`}
                onClick={() => close(true)}
              >
                {pending.opts.confirmText ?? '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}
