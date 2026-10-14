import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Search, Trash2, Wand2 } from 'lucide-react';
import { TaskForm } from '../components/TaskForm';
import { TaskItem } from '../components/TaskItem';
import { Empty, PageHeader, Tabs, errMsg, useUI } from '../components/ui';
import type { ISODate, Task } from '../db/schema';
import { deleteTask, moveInstance } from '../db/repo';
import {
  addDays, dateRange, endOfMonth, fmtDate, fmtLong, fmtMinutes, fmtShort, fmtTime, parseTime, startOfMonth, startOfWeek, WEEKDAY_NAMES,
} from '../lib/dates';
import { PRIORITIES } from '../lib/labels';
import { completion, isActive, isOverdue, recurrenceLabel, type Instance } from '../lib/recurrence';
import { findFreeSlot } from '../lib/slots';
import { applyMinimal } from '../lib/stats';
import { useData, useInstances } from '../state/data';

type View = 'today' | 'tomorrow' | 'week' | 'calendar' | 'all';

export function Planner() {
  const { today } = useData();
  const [view, setView] = useState<View>('today');
  const [adding, setAdding] = useState<ISODate | null>(null);
  return (
    <div className="fade-in">
      <PageHeader title="Планирование" actions={<button className="btn btn-primary" onClick={() => setAdding(today)}><Plus size={18} />Задача</button>} />
      <div className="mb-4">
        <Tabs label="Режим" value={view} onChange={setView}
          items={[['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['week', 'Неделя'], ['calendar', 'Календарь'], ['all', 'Все задачи']]} />
      </div>
      {view === 'today' && <DayView date={today} onAdd={setAdding} />}
      {view === 'tomorrow' && <DayView date={addDays(today, 1)} onAdd={setAdding} />}
      {view === 'week' && <WeekView onAdd={setAdding} />}
      {view === 'calendar' && <CalendarView onAdd={setAdding} />}
      {view === 'all' && <AllTasks />}
      <TaskForm open={!!adding} onClose={() => setAdding(null)} defaultDate={adding ?? today} />
    </div>
  );
}

function DayView({ date, onAdd }: { date: ISODate; onAdd: (d: ISODate) => void }) {
  const { settings, today } = useData();
  const all = useInstances(date, date);
  const minimal = settings.minimalDate === date;
  const list = minimal ? applyMinimal(all) : all;
  const timed = list.filter((i) => i.startTime);
  const untimed = list.filter((i) => !i.startTime);
  const load = list.filter(isActive).reduce((a, i) => a + i.durationMin, 0);
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{fmtLong(date)}</h2>
        <span className="text-sm text-muted">Нагрузка: {fmtMinutes(load)}{minimal && ' · минимальный день'}</span>
      </div>
      {!list.length && (
        <Empty icon={<CalendarPlus size={28} />} title="Задач нет" text="Создайте задачу на этот день."
          action={<button className="btn btn-primary" onClick={() => onAdd(date)}><Plus size={18} />Добавить</button>} />
      )}
      {timed.length > 0 && <ul className="grid gap-2">{timed.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>}
      {untimed.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted">Без назначенного времени</h3>
          {date >= today && <SlotHelper date={date} items={untimed.filter((i) => i.status === 'planned')} dayInsts={all} />}
          <ul className="grid gap-2">{untimed.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>
        </>
      )}
      {list.length > 0 && (
        <button className="btn btn-ghost justify-start text-muted" onClick={() => onAdd(date)}><Plus size={16} />Добавить на этот день</button>
      )}
    </section>
  );
}

/** Предлагает распределить задачи без времени по свободным окнам — применяется только по нажатию. */
function SlotHelper({ date, items, dayInsts }: { date: ISODate; items: Instance[]; dayInsts: Instance[] }) {
  const { settings, today, nowMin } = useData();
  const { toast } = useUI();
  const [plan, setPlan] = useState<{ inst: Instance; start: number }[] | null>(null);
  if (!items.length) return null;

  function propose() {
    const placed: Instance[] = dayInsts.filter((i) => i.startTime);
    const out: { inst: Instance; start: number }[] = [];
    for (const inst of [...items].sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0))) {
      const s = findFreeSlot(placed, inst.durationMin + 10, settings.dayStart, settings.dayEnd, date === today ? nowMin : 0);
      if (s === null) continue;
      out.push({ inst, start: s });
      placed.push({ ...inst, startTime: fmtTime(s), durationMin: inst.durationMin + 10 });
    }
    setPlan(out);
  }

  async function apply() {
    try {
      for (const p of plan ?? []) await moveInstance(p.inst, date, fmtTime(p.start));
      toast('Время назначено на этот день');
      setPlan(null);
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div className="rounded-xl border border-dashed border-line p-3 text-sm">
      {!plan ? (
        <button className="btn btn-sm btn-outline" onClick={propose}><Wand2 size={14} />Предложить распределение по свободному времени</button>
      ) : plan.length ? (
        <div className="grid gap-2">
          <p className="text-muted">Предложение (с перерывами по 10 мин, в пределах {settings.dayStart}–{settings.dayEnd}):</p>
          <ul className="grid gap-1">
            {plan.map((p) => <li key={p.inst.key} className="tabular-nums">{fmtTime(p.start)}–{fmtTime(p.start + p.inst.durationMin)} · {p.inst.title}</li>)}
          </ul>
          {plan.length < items.length && <p className="text-amber-600 dark:text-amber-400">Не всё поместилось: {items.length - plan.length} задач(и) остаются без времени.</p>}
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={apply}>Применить на этот день</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setPlan(null)}>Отказаться</button>
          </div>
          <p className="text-xs text-muted">Чтобы закрепить время навсегда, отредактируйте всю серию.</p>
        </div>
      ) : (
        <p className="text-muted">Свободного времени в рабочем дне не осталось. Измените границы дня в настройках или сократите план.</p>
      )}
    </div>
  );
}

function WeekView({ onAdd }: { onAdd: (d: ISODate) => void }) {
  const { today, settings } = useData();
  const [offset, setOffset] = useState(0);
  const from = addDays(startOfWeek(today, settings.weekStart), offset * 7);
  const to = addDays(from, 6);
  const insts = useInstances(from, to);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-outline btn-icon" onClick={() => setOffset(offset - 1)} aria-label="Предыдущая неделя"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="font-medium">{fmtShort(from)} — {fmtShort(to)}</p>
          {offset !== 0 && <button className="text-xs text-accent hover:underline" onClick={() => setOffset(0)}>Текущая неделя</button>}
        </div>
        <button className="btn btn-outline btn-icon" onClick={() => setOffset(offset + 1)} aria-label="Следующая неделя"><ChevronRight size={18} /></button>
      </div>
      {dateRange(from, to).map((d) => {
        const list = insts.filter((i) => i.date === d);
        return (
          <div key={d}>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className={`text-sm font-semibold ${d === today ? 'text-accent' : ''}`}>{fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}{d === today && ' · сегодня'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => onAdd(d)} aria-label={`Добавить задачу на ${fmtShort(d)}`}><Plus size={14} /></button>
            </div>
            {list.length ? <ul className="grid gap-2">{list.map((i) => <TaskItem key={i.key} inst={i} />)}</ul> : <p className="text-sm text-muted">—</p>}
          </div>
        );
      })}
    </section>
  );
}

function CalendarView({ onAdd }: { onAdd: (d: ISODate) => void }) {
  const { today, nowMin, settings } = useData();
  const [month, setMonth] = useState(startOfMonth(today));
  const [sel, setSel] = useState<ISODate>(today);
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
    const d = new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 10);
    setMonth(d);
  };
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(i + settings.weekStart) % 7]);
  return (
    <section className="grid gap-4">
      <div className="card !p-3">
        <div className="mb-2 flex items-center justify-between">
          <button className="btn btn-ghost btn-icon" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button>
          <p className="font-medium">{fmtDate(first, { month: 'long', year: 'numeric' })}</p>
          <button className="btn btn-ghost btn-icon" onClick={() => shift(1)} aria-label="Следующий месяц"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{heads.map((h) => <div key={h} className="py-1">{h}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {dateRange(gridFrom, gridTo).map((d) => {
            const list = byDay.get(d) ?? [];
            const done = list.filter((i) => i.status === 'done').length;
            const overdue = list.some((i) => isOverdue(i, today, nowMin));
            const frac = list.length ? list.reduce((a, i) => a + completion(i), 0) / list.length : 0;
            const inMonth = d >= first && d <= last;
            return (
              <button key={d} onClick={() => setSel(d)} aria-pressed={sel === d}
                aria-label={`${fmtShort(d)}: задач ${list.length}, выполнено ${done}`}
                className={`flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors
                  ${sel === d ? 'bg-accent text-accent-fg' : d === today ? 'bg-accent-soft text-accent' : 'hover:bg-soft'} ${inMonth ? '' : 'opacity-40'}`}>
                <span className="tabular-nums">{Number(d.slice(8))}</span>
                {list.length > 0 && (
                  <span className={`h-1 w-4 rounded-full ${sel === d ? 'bg-accent-fg/70' : frac >= 1 ? 'bg-ok' : overdue ? 'bg-danger' : 'bg-muted/50'}`} />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Полоска: зелёная — всё выполнено, красная — есть просроченные, серая — запланировано.</p>
      </div>
      <DayView date={sel} onAdd={onAdd} />
    </section>
  );
}

function AllTasks() {
  const { tasks, areas } = useData();
  const { confirm, toast } = useUI();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Task | null>(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks
      .filter((t) => !s || t.title.toLowerCase().includes(s) || t.category.toLowerCase().includes(s))
      .sort((a, b) => Number(b.recurrence.kind !== 'none') - Number(a.recurrence.kind !== 'none') || b.date.localeCompare(a.date));
  }, [tasks, q]);
  return (
    <section className="grid gap-3">
      <label className="relative block">
        <span className="sr-only">Поиск</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Поиск по названию или категории" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!list.length && <Empty title={tasks.length ? 'Ничего не найдено' : 'Задач пока нет'} text="Создайте первую задачу кнопкой «Задача»." />}
      <ul className="grid gap-2">
        {list.map((t) => {
          const area = areas.find((a) => a.id === t.studyAreaId);
          const st = parseTime(t.startTime);
          return (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                  {t.recurrence.kind !== 'none'
                    ? <span className="chip"><Repeat size={11} />{recurrenceLabel(t)} с {fmtShort(t.date)}{t.endDate && ` по ${fmtShort(t.endDate)}`}</span>
                    : <span>{fmtShort(t.date)}</span>}
                  {st !== null && <span>{fmtTime(st)}</span>}
                  <span>{fmtMinutes(t.durationMin)}</span>
                  <span className="chip">{t.category}</span>
                  <span>{PRIORITIES[t.priority]}</span>
                  {area && <span className="chip">{area.name}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEdit(t)} aria-label={`Изменить ${t.title}`}><Pencil size={16} /></button>
              <button className="btn btn-ghost btn-icon !text-danger" aria-label={`Удалить ${t.title}`} onClick={async () => {
                if (await confirm({ title: 'Удалить задачу?', message: `«${t.title}» будет удалена из всех дней вместе с историей выполнения.`, confirmText: 'Удалить', danger: true })) {
                  try { await deleteTask(t.id); toast('Удалено'); } catch (e) { toast(errMsg(e), 'error'); }
                }
              }}><Trash2 size={16} /></button>
            </li>
          );
        })}
      </ul>
      {edit && <TaskForm open onClose={() => setEdit(null)} task={edit} />}
    </section>
  );
}
