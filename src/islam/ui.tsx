import type { ReactNode } from 'react';
import { AArrowDown, AArrowUp, RefreshCw, WifiOff } from 'lucide-react';
import { t } from '../i18n';

/** Регулятор размера шрифта: «А−», значение, «А+». */
export function FontStepper({ label, value, onChange, min = 14, max = 56, step = 2 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center justify-between gap-2" role="group" aria-label={label}>
      <span className="min-w-0 truncate text-[13px] font-semibold">{label}</span>
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-soft p-1">
        <button type="button" className="btn btn-ghost btn-icon !min-h-8 !min-w-8 !p-1" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={t('Уменьшить шрифт: {0}', label)}>
          <AArrowDown size={17} />
        </button>
        <span className="w-9 text-center text-[13px] font-bold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className="btn btn-ghost btn-icon !min-h-8 !min-w-8 !p-1" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={t('Увеличить шрифт: {0}', label)}>
          <AArrowUp size={17} />
        </button>
      </div>
    </div>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="grid gap-3" role="status" aria-live="polite">
      <div className="skeleton h-6 w-1/3" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
      <span className="sr-only">{label ?? t('Загрузка…')}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="card grid justify-items-center gap-3 py-8 text-center" role="alert">
      <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger"><WifiOff size={22} /></span>
      <p className="max-w-md text-sm">{error}</p>
      <button className="btn btn-outline" onClick={onRetry}><RefreshCw size={16} />{t('Повторить')}</button>
    </div>
  );
}

export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-center text-[11.5px] leading-relaxed text-muted">{children}</p>;
}

/** Переключатель-пилюля для панели настроек чтения. */
export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-card text-muted hover:text-fg'}`}>
      {children}
    </button>
  );
}
