import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { TaskForm, type TaskPreset } from '../components/TaskForm';
import { useQuickAdd } from '../components/Layout';
import { TaskItem } from '../components/TaskItem';
import { Empty, PageHeader, Tabs, errMsg, useUI } from '../components/ui';
import type { ISODate, Task } from '../db/schema';
import { deleteTask, moveInstance, saveTask } from '../db/repo';
import { parseQuick } from '../lib/quickadd';
import {
  addDays, dateRange, fmtDate, fmtLong, fmtMinutes, fmtShort, fmtTime, parseTime, showTime, showTimeStr, startOfWeek,
} from '../lib/dates';
import { categoryColor, PRIORITIES } from '../lib/labels';
import { isActive, isOverdue, recurrenceLabel, type Instance } from '../lib/recurrence';
import { findFreeSlot } from '../lib/slots';
import { applyMinimal } from '../lib/stats';
import { useData, useInstances } from '../state/data';

type View = 'today' | 'tomorrow' | 'week' | 'all';
type StatusFilter = 'all' | 'open' | 'done' | 'missed';

export function Planner() {
  const { today } = useData();
  const { openTask } = useQuickAdd();
  const [view, setView] = useState<View>('today');
  const date = view === 'tomorrow' ? addDays(today, 1) : today;
  return (
    <div className="fade-in">
      <PageHeader title="Задачи" subtitle="Планируйте день, отмечайте выполнение и переносите без потери истории."
        actions={<>
          <Link to="/calendar" className="btn btn-outline"><CalendarDays size={18} />Календарь</Link>
        </>} />
      <QuickAddBar date={date} />
      <div className="mb-4 mt-4">
        <Tabs label="Режим" value={view} onChange={setView}
          items={[['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['week', 'Неделя'], ['all', 'Все задачи']]} />
      </div>
      {view === 'today' && <DayView date={today} onAdd={(d) => openTask({ date: d })} />}
      {view === 'tomorrow' && <DayView date={addDays(today, 1)} onAdd={(d) => openTask({ date: d })} />}
      {view === 'week' && <WeekView onAdd={(d) => openTask({ date: d })} />}
      {view === 'all' && <AllTasks />}
    </div>
  );
}

/** Быстрое создание: «Арабский язык — 60 минут». Остальные поля можно уточнить в полной форме. */
function QuickAddBar({ date }: { date: ISODate }) {
  const { today } = useData();
  const { toast } = useUI();
  const { openTask } = useQuickAdd();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const p = parseQuick(text, today);
  const preset = (): TaskPreset => ({
    title: p.title, date: p.date ?? date, ...(p.durationMin ? { duration: String(p.durationMin) } : {}),
    ...(p.startTime ? { startTime: p.startTime } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.category ? { category: p.category } : {}),
  });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!p.title) { toast('Введите название задачи', 'error'); return; }
    setBusy(true);
    try {
      await saveTask({
        title: p.title, description: '', category: p.category ?? 'Учёба', date: p.date ?? date, startTime: p.startTime,
        durationMin: p.durationMin ?? 30, priority: p.priority ?? 'medium', recurrence: { kind: 'none' }, minimal: false,
      });
      toast(`Добавлено: ${p.title}`);
      setText('');
    } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  }
  const chips = text.trim() ? [
    p.date && p.date !== date ? fmtShort(p.date) : fmtShort(date),
    p.startTime ? `в ${showTimeStr(p.startTime)}` : null,
    `${p.durationMin ?? 30} мин${p.durationMin ? '' : ' (по умолч.)'}`,
    p.category ?? null, p.priority === 'high' ? 'важно' : null,
  ].filter(Boolean) as string[] : [];
  return (
    <form onSubmit={add} className="card !p-2.5 sm:!p-3">
      <div className="flex items-center gap-2 rounded-xl px-1 focus-within:bg-soft/60">
        <Sparkles size={18} className="ms-1.5 shrink-0 text-gold" aria-hidden />
        <label htmlFor="quick" className="sr-only">Быстрое добавление задачи</label>
        <input id="quick" className="min-h-10 w-full min-w-0 bg-transparent text-[15px] !outline-none placeholder:text-muted" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Быстро: «Арабский язык — 60 минут»" maxLength={200} autoComplete="off" />
        <button type="button" className="btn btn-ghost btn-sm hidden sm:inline-flex" onClick={() => { openTask({ date, preset: text.trim() ? preset() : undefined }); setText(''); }}>Подробнее</button>
        <button className="btn btn-primary btn-sm !min-h-9" disabled={busy || !p.title}><Plus size={16} /><span className="hidden sm:inline">Добавить</span></button>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1.5 pt-2">
          {chips.map((c) => <span key={c} className="chip !bg-accent-soft !text-accent">{c}</span>)}
          <button type="button" className="text-[12px] font-semibold text-muted underline-offset-2 hover:underline sm:hidden" onClick={() => { openTask({ date, preset: preset() }); setText(''); }}>Подробнее…</button>
        </div>
      ) : (
        <p className="px-1.5 pt-1.5 text-[12px] text-muted">Понимает длительность («90 мин», «1,5 ч»), время («в 7:30»), «завтра», категорию «#Языки» и «!» — важно.</p>
      )}
    </form>
  );
}

function DayView({ date, onAdd }: { date: ISODate; onAdd: (d: ISODate) => void }) {
  const { settings, today, nowMin } = useData();
  const all = useInstances(date, date);
  const minimal = settings.minimalDate === date;
  const [f, setF] = useState<StatusFilter>('all');
  const base = minimal ? applyMinimal(all) : all;
  const isMissed = (i: Instance) => i.status === 'skipped' || isOverdue(i, today, nowMin);
  const counts = {
    open: base.filter((i) => (i.status === 'planned' || i.status === 'partial') && !isOverdue(i, today, nowMin)).length,
    done: base.filter((i) => i.status === 'done').length,
    missed: base.filter(isMissed).length,
  };
  const list = base.filter((i) => f === 'all' || (f === 'done' ? i.status === 'done' : f === 'missed' ? isMissed(i) : (i.status === 'planned' || i.status === 'partial') && !isOverdue(i, today, nowMin)));
  const timed = list.filter((i) => i.startTime);
  const untimed = list.filter((i) => !i.startTime);
  const load = list.filter(isActive).reduce((a, i) => a + i.durationMin, 0);
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{fmtLong(date)}</h2>
        <span className="text-sm text-muted">Нагрузка: {fmtMinutes(load)}{minimal && ' · минимальный день'}</span>
      </div>
      {base.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Фильтр по статусу">
          {([['all', 'Все', base.length], ['open', 'В работе', counts.open], ['done', 'Выполнено', counts.done], ['missed', 'Пропущено / просрочено', counts.missed]] as [StatusFilter, string, number][]).map(([k, l, n]) => (
            <button key={k} aria-pressed={f === k} onClick={() => setF(k)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${f === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-card text-muted hover:text-fg'}`}>
              {l} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          ))}
        </div>
      )}
      {base.length > 0 && !list.length && <p className="rounded-2xl bg-card-2 px-4 py-8 text-center text-sm text-muted ring-1 ring-line">В этой группе задач нет</p>}
      {!base.length && (
        <Empty icon={<CalendarPlus size={28} />} title="Задач нет" text="Создайте задачу на этот день."
          action={<button className="btn btn-primary" onClick={() => onAdd(date)}><Plus size={18} />Добавить</button>} />
      )}
      {timed.length > 0 && <ul className="card-flat grid p-1.5">{timed.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>}
      {untimed.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted">Без назначенного времени</h3>
          {date >= today && f === 'all' && <SlotHelper date={date} items={untimed.filter((i) => i.status === 'planned')} dayInsts={all} />}
          <ul className="card-flat grid p-1.5">{untimed.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>
        </>
      )}
      {base.length > 0 && (
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
            {plan.map((p) => <li key={p.inst.key} className="tabular-nums">{showTime(p.start)}–{showTime(p.start + p.inst.durationMin)} · {p.inst.title}</li>)}
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
            {list.length ? <ul className="card-flat grid p-1.5">{list.map((i) => <TaskItem key={i.key} inst={i} compact />)}</ul> : <p className="px-1 text-sm text-muted">Свободный день</p>}
          </div>
        );
      })}
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
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input ps-9" placeholder="Поиск по названию или категории" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!list.length && <Empty title={tasks.length ? 'Ничего не найдено' : 'Задач пока нет'} text="Создайте первую задачу кнопкой «Задача»." />}
      <ul className="grid gap-2">
        {list.map((t) => {
          const area = areas.find((a) => a.id === t.studyAreaId);
          const st = parseTime(t.startTime);
          return (
            <li key={t.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: categoryColor(t.category) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                  {t.recurrence.kind !== 'none'
                    ? <span className="chip"><Repeat size={11} />{recurrenceLabel(t)} с {fmtShort(t.date)}{t.endDate && ` по ${fmtShort(t.endDate)}`}</span>
                    : <span>{fmtShort(t.date)}</span>}
                  {st !== null && <span>{showTime(st)}</span>}
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
