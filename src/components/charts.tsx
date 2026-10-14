// Общие визуальные блоки на реальных данных: цвета темы для Recharts, недельный график, мини-календарь.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ISODate } from '../db/schema';
import { addDays, dateRange, endOfMonth, fmtDate, fmtWeekdayShort, startOfMonth, startOfWeek, WEEKDAY_NAMES } from '../lib/dates';
import { isActive, isOverdue, type Instance } from '../lib/recurrence';
import { dayStats } from '../lib/stats';
import { useData, useInstances } from '../state/data';

/** Текущие значения CSS-переменных темы (Recharts требует явные цвета). Обновляются при смене темы. */
export function useThemeColors() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const o = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      dark, accent: v('--accent'), gold: v('--gold'), danger: v('--danger'), muted: v('--muted'), grid: v('--border'),
      card: v('--card'), text: v('--text'), soft: v('--soft'), warn: v('--warn'), info: v('--info'),
    };
  }, [dark]);
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function chartTooltip(c: ReturnType<typeof useThemeColors>) {
  return {
    contentStyle: { background: c.card, border: `1px solid ${c.grid}`, borderRadius: 12, color: c.text, fontSize: 12, boxShadow: '0 8px 24px -12px rgb(0 0 0 / .3)' },
    labelStyle: { color: c.text, fontWeight: 700, marginBottom: 2 },
    cursor: { fill: c.soft },
  };
}

/** Столбцы по дням недели: выполнено / частично / пропущено (включая просроченные прошедших дней). */
export function WeekChart({ from, height = 170 }: { from: ISODate; height?: number }) {
  const { today, nowMin, sessions } = useData();
  const to = addDays(from, 6);
  const insts = useInstances(from, to);
  const c = useThemeColors();
  const data = useMemo(() => dayStats(from, to, insts, sessions, today, nowMin).map((d) => ({
    name: fmtWeekdayShort(d.date),
    Выполнено: d.done,
    Частично: d.partial,
    Пропущено: d.skipped + d.overdue,
    Осталось: d.date >= today ? d.pending : 0,
  })), [from, to, insts, sessions, today, nowMin]);
  const empty = data.every((d) => !d.Выполнено && !d.Частично && !d.Пропущено && !d.Осталось);
  if (empty) return <p className="grid place-items-center rounded-xl bg-soft text-center text-sm text-muted" style={{ height }}>За эту неделю задач пока нет</p>;
  return (
    <div style={{ height }} role="img" aria-label="График выполнения задач по дням недели">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 0, top: 6, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={22} />
          <Tooltip {...chartTooltip(c)} />
          <Bar dataKey="Выполнено" stackId="a" fill={c.accent} animationDuration={500} />
          <Bar dataKey="Частично" stackId="a" fill={c.gold} animationDuration={500} />
          <Bar dataKey="Пропущено" stackId="a" fill={c.danger} fillOpacity={0.75} animationDuration={500} />
          <Bar dataKey="Осталось" stackId="a" fill={c.muted} fillOpacity={0.22} radius={[5, 5, 0, 0]} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-muted">
      {items.map(([l, col]) => <li key={l} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: col }} />{l}</li>)}
    </ul>
  );
}

/** Компактный календарь месяца: точки — дни с задачами; нажатие открывает день в календаре. */
export function MiniCalendar({ selected, onSelect }: { selected?: ISODate; onSelect?: (d: ISODate) => void }) {
  const { today, nowMin, settings } = useData();
  const nav = useNavigate();
  const [month, setMonth] = useState(startOfMonth(selected ?? today));
  const first = startOfMonth(month), last = endOfMonth(month);
  const gridFrom = startOfWeek(first, settings.weekStart);
  const gridTo = addDays(startOfWeek(last, settings.weekStart), 6);
  const insts = useInstances(gridFrom, gridTo);
  const byDay = useMemo(() => {
    const m = new Map<ISODate, Instance[]>();
    for (const i of insts) if (isActive(i)) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [insts]);
  const shift = (n: number) => {
    const [y, mo] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 10));
  };
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(i + settings.weekStart) % 7]);
  const pick = (d: ISODate) => (onSelect ? onSelect(d) : nav(`/calendar?d=${d}&v=day`));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[15px] font-bold">{fmtDate(first, { month: 'long', year: 'numeric' })}</p>
        <div className="flex">
          <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8 !p-1" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button>
          <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8 !p-1" onClick={() => shift(1)} aria-label="Следующий месяц"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">{heads.map((h) => <div key={h} className="py-1">{h}</div>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {dateRange(gridFrom, gridTo).map((d) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d >= first && d <= last;
          const isToday = d === today, isSel = d === selected;
          const allDone = list.length > 0 && list.every((i) => i.status === 'done');
          const late = list.some((i) => isOverdue(i, today, nowMin));
          return (
            <button key={d} onClick={() => pick(d)} aria-label={`${fmtDate(d, { day: 'numeric', month: 'long' })}: задач ${list.length}`} aria-current={isToday ? 'date' : undefined}
              className={`relative mx-auto grid size-9 place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors
                ${isToday ? 'bg-accent text-accent-fg' : isSel ? 'bg-accent-soft text-accent' : 'hover:bg-soft'} ${inMonth ? '' : 'opacity-35'}`}>
              {Number(d.slice(8))}
              {list.length > 0 && !isToday && (
                <span className={`absolute bottom-1 size-1 rounded-full ${allDone ? 'bg-ok' : late ? 'bg-danger' : 'bg-gold'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
