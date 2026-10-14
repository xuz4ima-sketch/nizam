// Модель повторяющихся задач: шаблон Task + записи Occurrence для отдельных дней.
import type { ISODate, Occurrence, Priority, SkipReason, StudySession, Task, TaskStatus } from '../db/schema';
import { dateRange, diffDays, maxISO, minISO, parseTime, weekday } from './dates';

import { t as T } from '../i18n';
export const occKey = (taskId: string, date: ISODate) => `${taskId}|${date}`;

export function occursOn(task: Task, d: ISODate): boolean {
  if (d < task.date) return false;
  if (task.endDate && d > task.endDate) return false;
  const r = task.recurrence;
  switch (r.kind) {
    case 'none': return d === task.date;
    case 'daily': return true;
    case 'weekdays': return r.days.includes(weekday(d));
    case 'interval': return diffDays(d, task.date) % Math.max(1, r.every) === 0;
  }
}

export interface Instance {
  key: string;
  task: Task;
  origDate: ISODate;
  date: ISODate; // фактическая дата (с учётом переноса)
  title: string;
  description: string;
  startTime?: string;
  durationMin: number;
  priority: Priority;
  status: TaskStatus;
  skipReason?: SkipReason;
  skipNote?: string;
  doneMin: number; // фактические минуты из сессий
  doneAmount: number;
  moved: boolean;
  occ?: Occurrence;
}

export type SessionIndex = Map<string, { min: number; amount: number; timerMin: number }>;

export function indexSessions(sessions: StudySession[]): SessionIndex {
  const m: SessionIndex = new Map();
  for (const s of sessions) {
    if (!s.occKey) continue;
    const cur = m.get(s.occKey) ?? { min: 0, amount: 0, timerMin: 0 };
    cur.min += s.minutes;
    cur.amount += s.amount ?? 0;
    if (s.source !== 'task') cur.timerMin += s.minutes;
    m.set(s.occKey, cur);
  }
  return m;
}

const PRIO: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function compareInstances(a: Instance, b: Instance) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = parseTime(a.startTime), tb = parseTime(b.startTime);
  if (ta !== null && tb !== null && ta !== tb) return ta - tb;
  if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
  return PRIO[a.priority] - PRIO[b.priority] || a.title.localeCompare(b.title, 'ru');
}

/** Разворачивает задачи в экземпляры за диапазон дат [from, to]. */
export function expand(tasks: Task[], occs: Occurrence[], sidx: SessionIndex, from: ISODate, to: ISODate): Instance[] {
  const occMap = new Map(occs.map((o) => [o.id, o]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const out: Instance[] = [];

  const build = (task: Task, orig: ISODate, occ?: Occurrence): Instance => {
    const key = occKey(task.id, orig);
    const s = sidx.get(key);
    return {
      key, task, origDate: orig, occ,
      date: occ?.movedTo ?? orig,
      title: occ?.title ?? task.title,
      description: occ?.description ?? task.description,
      startTime: occ ? (occ.startTime ?? (occ.movedTo ? undefined : task.startTime)) : task.startTime,
      durationMin: occ?.durationMin ?? task.durationMin,
      priority: task.priority,
      status: occ?.status ?? 'planned',
      skipReason: occ?.skipReason,
      skipNote: occ?.skipNote,
      doneMin: s?.min ?? 0,
      doneAmount: s?.amount ?? 0,
      moved: !!occ?.movedTo && occ.movedTo !== orig,
    };
  };

  for (const t of tasks) {
    const start = maxISO(from, t.date);
    const end = t.endDate ? minISO(to, t.endDate) : to;
    if (start > end) continue;
    const days = t.recurrence.kind === 'none' ? [t.date] : dateRange(start, end);
    for (const d of days) {
      if (!occursOn(t, d)) continue;
      const occ = occMap.get(occKey(t.id, d));
      if (occ?.status === 'deleted') continue;
      if (occ?.movedTo && occ.movedTo !== d) continue; // показывается в другой день
      out.push(build(t, d, occ));
    }
  }
  for (const o of occs) {
    if (!o.movedTo || o.movedTo === o.date || o.status === 'deleted') continue;
    if (o.movedTo < from || o.movedTo > to) continue;
    const t = taskMap.get(o.taskId);
    if (t) out.push(build(t, o.date, o));
  }
  return out.sort(compareInstances);
}

/** Находит экземпляр по ключу `${taskId}|${date}` с учётом переноса. */
export function findInstance(tasks: Task[], occs: Occurrence[], sidx: SessionIndex, key: string): Instance | undefined {
  const sep = key.lastIndexOf('|');
  const task = tasks.find((t) => t.id === key.slice(0, sep));
  if (!task) return undefined;
  const occ = occs.find((o) => o.id === key);
  const d = occ?.movedTo ?? key.slice(sep + 1);
  return expand([task], occ ? [occ] : [], sidx, d, d).find((i) => i.key === key);
}

/** Просрочено: запланировано, но время прошло. Просроченная задача не считается выполненной. */
export function isOverdue(i: Instance, today: ISODate, nowMin: number): boolean {
  if (i.status !== 'planned') return false;
  if (i.date < today) return true;
  if (i.date > today) return false;
  const st = parseTime(i.startTime);
  return st !== null && st + i.durationMin < nowMin;
}

/** Доля выполнения экземпляра 0..1 (частичное — пропорционально фактическому времени). */
export function completion(i: Instance): number {
  if (i.status === 'done') return 1;
  if (i.status === 'cancelled' || i.status === 'skipped' || i.status === 'deleted') return 0;
  if (i.durationMin <= 0) return 0;
  return Math.min(1, i.doneMin / i.durationMin);
}

export const isActive = (i: Instance) => i.status !== 'cancelled' && i.status !== 'deleted';

export function recurrenceLabel(t: Task): string {
  const r = t.recurrence;
  switch (r.kind) {
    case 'none': return '';
    case 'daily': return T('Ежедневно');
    case 'interval': return r.every === 1 ? T('Ежедневно') : T('Каждые {0} дн.', r.every);
    case 'weekdays': {
      const names = [T('Вс'), T('Пн'), T('Вт'), T('Ср'), T('Чт'), T('Пт'), T('Сб')];
      return [1, 2, 3, 4, 5, 6, 0].filter((d) => r.days.includes(d)).map((d) => names[d]).join(', ');
    }
  }
}
