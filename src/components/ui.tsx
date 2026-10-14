import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ValidationError } from '../lib/validate';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Неизвестная ошибка');
export const errFields = (e: unknown) => (e instanceof ValidationError ? e.errors : {});

/* ---------- Modal (нативный <dialog>: фокус, Esc, доступность) ---------- */

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
          </div>
          <div className="px-5 pb-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Confirm & Toast ---------- */

interface ConfirmOpts { title: string; message?: ReactNode; confirmText?: string; danger?: boolean }
interface Toast { id: number; text: string; kind: 'ok' | 'error' }
interface UICtx { confirm: (o: ConfirmOpts) => Promise<boolean>; toast: (text: string, kind?: Toast['kind']) => void }
const UI = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const close = (v: boolean) => { pending?.resolve(v); setPending(null); };
  return (
    <UI.Provider value={{ confirm, toast }}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        footer={<>
          <button className="btn btn-outline" onClick={() => close(false)}>Отмена</button>
          <button className={`btn ${pending?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
            {pending?.confirmText ?? 'Подтвердить'}
          </button>
        </>}
      >
        {pending?.message && <div className="muted">{pending.message}</div>}
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`fade-in pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-brand-800 text-white dark:bg-brand-300 dark:text-brand-900'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </UI.Provider>
  );
}

export function useUI() {
  const v = useContext(UI);
  if (!v) throw new Error('UIProvider отсутствует');
  return v;
}

/* ---------- Мелкие компоненты ---------- */

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function ProgressBar({ value, label, tone = 'brand', size = 'md' }: { value: number; label?: string; tone?: 'brand' | 'ok' | 'warn'; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const color = tone === 'warn' ? 'bg-amber-500' : value >= 1 ? 'bg-ok' : 'bg-accent';
  return (
    <div className={`w-full overflow-hidden rounded-full bg-soft ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-soft p-1">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={`tab ${value === k ? 'tab-active' : ''}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card !p-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Числовое поле, которое хранит строку во время ввода и отдаёт число (NaN, если пусто). */
export const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
