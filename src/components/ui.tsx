import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { ValidationError } from '../lib/validate';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Неизвестная ошибка');
export const errFields = (e: unknown) => (e instanceof ValidationError ? e.errors : {});

/* ---------- Modal (нативный <dialog>: фокус, Esc, доступность) ---------- */

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
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
      className={`modal sheet ${wide ? 'sm:!w-[min(720px,calc(100vw-24px))]' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="flex flex-col">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2 sm:pt-4">
            <h2 id={titleId} className="min-w-0 truncate text-[17px] font-bold tracking-tight">{title}</h2>
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
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`fade-in pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-lg)] ${t.kind === 'error' ? 'bg-danger text-white dark:text-[#2a0f0c]' : 'bg-brand-900 text-white dark:bg-accent-strong dark:text-brand-900'}`}>
            {t.kind === 'error' ? <CircleAlert size={18} className="shrink-0" /> : <CircleCheck size={18} className="shrink-0" />}
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

export function ProgressBar({ value, label, tone = 'brand', size = 'md', color }: {
  value: number; label?: string; tone?: 'brand' | 'ok' | 'warn' | 'gold'; size?: 'sm' | 'md'; color?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const cls = tone === 'warn' ? 'bg-warn' : tone === 'gold' ? 'bg-gold' : value >= 1 ? 'bg-ok' : 'bg-accent';
  return (
    <div className={`w-full overflow-hidden rounded-full bg-soft ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className={`bar-anim h-full rounded-full ${color ? '' : cls}`} style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}

/** Кольцевой индикатор прогресса. */
export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', track = 'var(--soft)', children, label }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; label?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle className="ring-anim" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

export function IconBadge({ children, tone = 'accent', size = 40 }: { children: ReactNode; tone?: 'accent' | 'gold' | 'warn' | 'info' | 'danger'; size?: number }) {
  const cls = {
    accent: 'bg-accent-soft text-accent', gold: 'bg-gold-soft text-[#8a6d35] dark:text-gold', warn: 'bg-warn-soft text-warn',
    info: 'bg-soft text-info', danger: 'bg-danger-soft text-danger',
  }[tone];
  return <div className={`icon-badge ${cls}`} style={{ width: size, height: size }} aria-hidden>{children}</div>;
}

export function SectionHeader({ title, action, icon }: { title: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
      <h2 className="h2 flex min-w-0 items-center gap-2">{icon}{title}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="fade-in flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-line bg-card-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <p className="font-bold">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="h1 text-balance">{title}</h1>
        {subtitle && <p className="mt-1 muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-soft p-1">
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
    <div className="card !p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Числовое поле, которое хранит строку во время ввода и отдаёт число (NaN, если пусто). */
export const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
