import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQuickAdd } from '../components/Layout';
import { InstanceActions, TaskItem } from '../components/TaskItem';
import { Empty, PageHeader, Tabs } from '../components/ui';
import type { ISODate } from '../db/schema';
import {
  addDays, dateRange, endOfMonth, fmtDate, fmtMinutes, isValidISO, parseTime, showTime, startOfMonth, startOfWeek, WEEKDAY_NAMES, weekday,
} from '../lib/dates';
import { categoryColor } from '../lib/labels';
import { completion, isActive, isOverdue, type Instance } from '../lib/recurrence';
import { findOverlaps, layoutDay } from '../lib/slots';
import { useData, useInstances } from '../state/data';

import { t as T } from '../i18n';
type View = 'day' | 'week' | 'month';
const HOUR_PX = 52;

export default function CalendarPage() {
  const { today } = useData();
  const [params, setParams] = useSearchParams();
  const d = params.get('d');
  const date = d && isValidISO(d) ? d : today;
  const v = params.get('v');
  const view: View = v === 'day' || v === 'week' || v === 'month' ? v : 'month';
  const set = (nd: ISODate, nv: View = view) => setParams({ d: nd, v: nv }, { replace: true });
  const [act, setAct] = useState<Instance | null>(null);

  const step = (n: number) => {
    if (view === 'day') set(addDays(date, n));
    else if (view === 'week') set(addDays(date, 7 * n));
    else { const [y, m] = date.split('-').map(Number); set(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)); }
  };
  const { settings } = useData();
  const title = view === 'month' ? fmtDate(date, { month: 'long', year: 'numeric' })
    : view === 'week' ? (() => { const f = startOfWeek(date, settings.weekStart); return `${fmtDate(f, { day: 'numeric', month: 'short' })} — ${fmtDate(addDays(f, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`; })()
      : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fade-in">
      <PageHeader title={T('Календарь')} subtitle={T('Реальные сохранённые задачи, включая повторяющиеся. Расписание меняется только по вашему действию.')} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button className="btn btn-outline btn-icon" onClick={() => step(-1)} aria-label={T('Назад')}><ChevronLeft size={18} className="rtl:-scale-x-100" /></button>
          <button className="btn btn-outline" onClick={() => set(today)} disabled={date === today && view !== 'week'}>{T('Сегодня')}</button>
          <button className="btn btn-outline btn-icon" onClick={() => step(1)} aria-label={T('Вперёд')}><ChevronRight size={18} className="rtl:-scale-x-100" /></button>
          <h2 className="ms-2 text-[16px] font-bold sm:text-lg" aria-live="polite">{title}</h2>
        </div>
        <Tabs label={T('Режим календаря')} value={view} onChange={(nv) => set(date, nv)} items={[['day', T('День')], ['week', T('Неделя')], ['month', T('Месяц')]]} />
      </div>
      {view === 'month' && <MonthView date={date} onPick={(nd) => set(nd)} onOpen={setAct} />}
      {view === 'week' && <WeekGrid date={date} onOpen={setAct} onDay={(nd) => set(nd, 'day')} />}
      {view === 'day' && <DayTimeline date={date} onOpen={setAct} />}
      {act && <InstanceActions inst={act} onClose={() => setAct(null)} />}
    </div>
  );
}

function useByDay(from: ISODate, to: ISODate) {
  const insts = useInstances(from, to);
  return useMemo(() => {
    const m = new Map<ISODate, Instance[]>();
    for (const i of insts) if (isActive(i)) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [insts]);
}

/* ---------- Месяц ---------- */
function MonthView({ date, onPick, onOpen }: { date: ISODate; onPick: (d: ISODate) => void; onOpen: (i: Instance) => void }) {
  const { today, nowMin, settings } = useData();
  const first = startOfMonth(date), last = endOfMonth(date);
  const gridFrom = startOfWeek(first, settings.weekStart);
  const gridTo = addDays(startOfWeek(last, settings.weekStart), 6);
  const byDay = useByDay(gridFrom, gridTo);
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(i + settings.weekStart) % 7]);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="card !p-2 sm:!p-3">
        <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-muted">{heads.map((h) => <div key={h} className="py-2">{h}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {dateRange(gridFrom, gridTo).map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d >= first && d <= last;
            const frac = list.length ? list.reduce((a, i) => a + completion(i), 0) / list.length : 0;
            const late = list.some((i) => isOverdue(i, today, nowMin));
            return (
              <div key={d} className={`flex min-h-[64px] flex-col rounded-xl border p-1 text-start transition-colors sm:min-h-[104px] sm:p-1.5 ${d === date ? 'border-accent bg-accent-soft/50' : 'border-transparent hover:bg-soft'} ${inMonth ? '' : 'opacity-40'}`}>
                <button onClick={() => onPick(d)} className="flex items-center justify-between gap-1" aria-label={T('{0}: задач {1}', fmtDate(d, { day: 'numeric', month: 'long' }), list.length)} aria-pressed={d === date}>
                  <span className={`grid size-7 place-items-center rounded-full text-[13px] font-bold tabular-nums ${d === today ? 'bg-accent text-accent-fg' : ''}`}>{Number(d.slice(8))}</span>
                  {list.length > 0 && <span className={`hidden text-[10px] font-bold tabular-nums sm:inline ${frac >= 1 ? 'text-ok' : late ? 'text-danger' : 'text-muted'}`}>{Math.round(frac * 100)}%</span>}
                </button>
                <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((i) => (
                    <button key={i.key} onClick={() => onOpen(i)} className={`truncate rounded-md px-1.5 py-0.5 text-start text-[11px] font-semibold ${i.status === 'done' ? 'line-through opacity-60' : ''}`}
                      style={{ background: `color-mix(in srgb, ${categoryColor(i.task.category)} 14%, transparent)`, color: `color-mix(in srgb, ${categoryColor(i.task.category)} 80%, var(--text))` }}>
                      {i.startTime && <span className="tabular-nums">{i.startTime} </span>}{i.title}
                    </button>
                  ))}
                  {list.length > 3 && <button onClick={() => onPick(d)} className="px-1 text-start text-[11px] font-semibold text-muted">{T('ещё')}{' '}{list.length - 3}</button>}
                </div>
                <div className="mt-auto flex flex-wrap justify-center gap-0.5 pb-1 sm:hidden">
                  {list.slice(0, 4).map((i) => <span key={i.key} className="size-1.5 rounded-full" style={{ background: i.status === 'done' ? 'var(--ok)' : categoryColor(i.task.category) }} />)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <DayAgenda date={date} />
    </div>
  );
}

function DayAgenda({ date }: { date: ISODate }) {
  const all = useInstances(date, date);
  const { openTask } = useQuickAdd();
  const overlaps = findOverlaps(all);
  const load = all.filter(isActive).reduce((a, i) => a + i.durationMin, 0);
  return (
    <section className="card !p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div><h2 className="h2">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p className="text-[12px] text-muted">{T('Нагрузка:')}{' '}{fmtMinutes(load)}</p></div>
        <button className="btn btn-soft btn-sm" onClick={() => openTask({ date })}><Plus size={15} />{T('Задача')}</button>
      </div>
      <OverlapNote pairs={overlaps} />
      <div className="px-2 pb-3 pt-2">
        {all.length ? <ul className="grid">{all.map((i) => <TaskItem key={i.key} inst={i} compact />)}</ul>
          : <p className="px-3 py-8 text-center text-sm text-muted">{T('На этот день задач нет')}</p>}
      </div>
    </section>
  );
}

function OverlapNote({ pairs }: { pairs: [Instance, Instance][] }) {
  if (!pairs.length) return null;
  return (
    <div className="mx-4 mt-3 flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]" role="note">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <p className="font-semibold">{T('Пересечение по времени:')}{' '}{pairs.length}</p>
        <p className="text-muted">{pairs.slice(0, 2).map(([a, b]) => T('«{0}» и «{1}»', a.title, b.title)).join('; ')}{T('. Откройте задачу и выберите «Перенести» — приложение подскажет свободное окно.')}</p>
      </div>
    </div>
  );
}

/* ---------- Сетка времени (день и неделя) ---------- */
function hoursRange(dayStart: string, dayEnd: string, items: { start: number; end: number }[]) {
  let from = Math.floor((parseTime(dayStart) ?? 7 * 60) / 60);
  let to = Math.ceil((parseTime(dayEnd) ?? 23 * 60) / 60);
  for (const it of items) { from = Math.min(from, Math.floor(it.start / 60)); to = Math.max(to, Math.ceil(it.end / 60)); }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

function EventBlock({ p, from, onOpen, narrow }: { p: ReturnType<typeof layoutDay>[number]; from: number; onOpen: (i: Instance) => void; narrow?: boolean }) {
  const { today, nowMin } = useData();
  const color = categoryColor(p.inst.task.category);
  const top = ((p.start - from * 60) / 60) * HOUR_PX;
  const h = Math.max(22, ((p.end - p.start) / 60) * HOUR_PX - 2);
  const done = p.inst.status === 'done';
  const late = isOverdue(p.inst, today, nowMin);
  return (
    <button onClick={() => onOpen(p.inst)}
      className={`absolute overflow-hidden rounded-lg border-s-[3px] px-1.5 py-1 text-start transition-[filter] hover:brightness-95 ${done ? 'opacity-60' : ''}`}
      style={{
        top, height: h, insetInlineStart: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 4px)`,
        background: `color-mix(in srgb, ${color} 15%, var(--card))`, borderColor: late ? 'var(--danger)' : color,
      }}
      aria-label={`${p.inst.title}, ${showTime(p.start)}–${showTime(p.end)}`}>
      <p className={`truncate text-[11.5px] font-bold leading-tight ${done ? 'line-through' : ''}`} style={{ color: `color-mix(in srgb, ${color} 75%, var(--text))` }}>{p.inst.title}</p>
      {!narrow && h > 34 && <p className="truncate text-[10.5px] tabular-nums text-muted">{showTime(p.start)}–{showTime(p.end)}</p>}
    </button>
  );
}

function HourLabels({ from, to }: { from: number; to: number }) {
  return (
    <div className="relative w-11 shrink-0" style={{ height: (to - from) * HOUR_PX }} aria-hidden>
      {Array.from({ length: to - from }, (_, k) => (
        <span key={k} className={`absolute end-2 text-[10.5px] font-semibold tabular-nums text-muted ${k === 0 ? '' : '-translate-y-1/2'}`} style={{ top: k * HOUR_PX }}>{showTime((from + k) * 60)}</span>
      ))}
    </div>
  );
}

function NowLine({ from }: { from: number }) {
  const { nowMin } = useData();
  const top = ((nowMin - from * 60) / 60) * HOUR_PX;
  if (top < 0) return null;
  return <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top }} aria-hidden><span className="-ms-1 size-2 rounded-full bg-danger" /><span className="h-px flex-1 bg-danger" /></div>;
}

function Untimed({ list, onOpen }: { list: Instance[]; onOpen: (i: Instance) => void }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((i) => (
        <button key={i.key} onClick={() => onOpen(i)} className={`max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${i.status === 'done' ? 'line-through opacity-60' : ''}`}
          style={{ background: `color-mix(in srgb, ${categoryColor(i.task.category)} 14%, transparent)`, color: `color-mix(in srgb, ${categoryColor(i.task.category)} 80%, var(--text))` }}>
          {i.title}
        </button>
      ))}
    </div>
  );
}

function DayTimeline({ date, onOpen }: { date: ISODate; onOpen: (i: Instance) => void }) {
  const { settings, today } = useData();
  const { openTask } = useQuickAdd();
  const all = useInstances(date, date).filter(isActive);
  const placed = layoutDay(all);
  const untimed = all.filter((i) => parseTime(i.startTime) === null);
  const { from, to } = hoursRange(settings.dayStart, settings.dayEnd, placed);
  const overlaps = findOverlaps(all);
  if (!all.length) return <Empty title={T('На этот день задач нет')} text={T('Создайте задачу — она появится на временной шкале.')} action={<button className="btn btn-primary" onClick={() => openTask({ date })}><Plus size={18} />{T('Добавить')}</button>} />;
  return (
    <section className="card !p-0">
      <OverlapNote pairs={overlaps} />
      {untimed.length > 0 && <div className="border-b border-line px-4 py-3"><p className="eyebrow mb-1.5">{T('Без времени')}</p><Untimed list={untimed} onOpen={onOpen} /></div>}
      <div className="flex px-2 py-4 sm:px-4">
        <HourLabels from={from} to={to} />
        <div className="relative flex-1 border-s border-line" style={{ height: (to - from) * HOUR_PX }}>
          {Array.from({ length: to - from }, (_, k) => <div key={k} className="absolute inset-x-0 border-t border-line/70" style={{ top: k * HOUR_PX }} />)}
          {date === today && <NowLine from={from} />}
          {placed.map((p) => <EventBlock key={p.inst.key} p={p} from={from} onOpen={onOpen} />)}
        </div>
      </div>
    </section>
  );
}

function WeekGrid({ date, onOpen, onDay }: { date: ISODate; onOpen: (i: Instance) => void; onDay: (d: ISODate) => void }) {
  const { settings, today } = useData();
  const from = startOfWeek(date, settings.weekStart);
  const days = dateRange(from, addDays(from, 6));
  const byDay = useByDay(from, addDays(from, 6));
  const placedByDay = days.map((d) => layoutDay(byDay.get(d) ?? []));
  const hr = hoursRange(settings.dayStart, settings.dayEnd, placedByDay.flat());
  const anyUntimed = days.some((d) => (byDay.get(d) ?? []).some((i) => parseTime(i.startTime) === null));
  return (
    <section className="card thin-scroll overflow-x-auto !p-0">
      <div className="min-w-[680px]">
        <div className="sticky top-0 z-10 flex border-b border-line bg-card">
          <div className="w-11 shrink-0" />
          {days.map((d) => (
            <button key={d} onClick={() => onDay(d)} className="flex-1 py-2.5 text-center hover:bg-soft" aria-label={T('Открыть день {0}', fmtDate(d, { day: 'numeric', month: 'long' }))}>
              <p className="text-[11px] font-bold uppercase text-muted">{WEEKDAY_NAMES[weekday(d)]}</p>
              <p className={`mx-auto mt-0.5 grid size-8 place-items-center rounded-full text-[15px] font-extrabold tabular-nums ${d === today ? 'bg-accent text-accent-fg' : ''}`}>{Number(d.slice(8))}</p>
            </button>
          ))}
        </div>
        {anyUntimed && (
          <div className="flex border-b border-line">
            <div className="w-11 shrink-0 pt-2 text-center text-[10px] font-semibold text-muted">{T('весь')}<br />{T('день')}</div>
            {days.map((d) => <div key={d} className="min-w-0 flex-1 border-s border-line p-1"><Untimed list={(byDay.get(d) ?? []).filter((i) => parseTime(i.startTime) === null)} onOpen={onOpen} /></div>)}
          </div>
        )}
        <div className="flex py-3 pe-2">
          <HourLabels from={hr.from} to={hr.to} />
          {days.map((d, k) => (
            <div key={d} className="relative min-w-0 flex-1 border-s border-line" style={{ height: (hr.to - hr.from) * HOUR_PX }}>
              {Array.from({ length: hr.to - hr.from }, (_, j) => <div key={j} className="absolute inset-x-0 border-t border-line/60" style={{ top: j * HOUR_PX }} />)}
              {d === today && <NowLine from={hr.from} />}
              {placedByDay[k].map((p) => <EventBlock key={p.inst.key} p={p} from={hr.from} onOpen={onOpen} narrow />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
