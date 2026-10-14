// Аналитика: все показатели вычисляются из сохранённых задач, экземпляров и сессий.
import type { ISODate, Occurrence, SkipReason, StudySession } from '../db/schema';
import { dateRange, parseTime, weekday } from './dates';
import { completion, isActive, isOverdue, type Instance } from './recurrence';

export interface DayStat {
  date: ISODate;
  planned: number;
  done: number;
  partial: number;
  skipped: number;
  overdue: number;
  pending: number;
  plannedMin: number;
  actualMin: number; // всё сохранённое время за день (задачи, таймер, направления)
  progress: number; // средняя доля выполнения 0..1
}

export function dayStat(date: ISODate, insts: Instance[], sessions: StudySession[], today: ISODate, nowMin: number): DayStat {
  const list = insts.filter((i) => i.date === date && isActive(i));
  let done = 0, partial = 0, skipped = 0, overdue = 0, pending = 0, plannedMin = 0, sum = 0;
  for (const i of list) {
    plannedMin += i.durationMin;
    sum += completion(i);
    if (i.status === 'done') done++;
    else if (i.status === 'partial') partial++;
    else if (i.status === 'skipped') skipped++;
    else if (isOverdue(i, today, nowMin)) overdue++;
    else pending++;
  }
  let actualMin = 0;
  for (const s of sessions) if (s.date === date) actualMin += s.minutes;
  return { date, planned: list.length, done, partial, skipped, overdue, pending, plannedMin, actualMin, progress: list.length ? sum / list.length : 0 };
}

export function dayStats(from: ISODate, to: ISODate, insts: Instance[], sessions: StudySession[], today: ISODate, nowMin: number) {
  return dateRange(from, to).map((d) => dayStat(d, insts, sessions, today, nowMin));
}

export function summarize(days: DayStat[]) {
  const s = days.reduce(
    (a, d) => ({
      planned: a.planned + d.planned, done: a.done + d.done, partial: a.partial + d.partial, skipped: a.skipped + d.skipped,
      overdue: a.overdue + d.overdue, plannedMin: a.plannedMin + d.plannedMin, actualMin: a.actualMin + d.actualMin,
      progressSum: a.progressSum + d.progress * d.planned,
    }),
    { planned: 0, done: 0, partial: 0, skipped: 0, overdue: 0, plannedMin: 0, actualMin: 0, progressSum: 0 },
  );
  return { ...s, doneRate: s.planned ? s.done / s.planned : 0, progress: s.planned ? s.progressSum / s.planned : 0 };
}

export function skipReasonCounts(occs: Occurrence[], from: ISODate, to: ISODate) {
  const m = new Map<SkipReason, number>();
  for (const o of occs) {
    const d = o.movedTo ?? o.date;
    if (o.status === 'skipped' && o.skipReason && d >= from && d <= to) m.set(o.skipReason, (m.get(o.skipReason) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Чаще всего откладываемые занятия: пропуски + просрочки + переносы. */
export function postponedRanking(insts: Instance[], today: ISODate, nowMin: number, limit = 5) {
  const m = new Map<string, { title: string; skipped: number; overdue: number; moved: number; total: number }>();
  for (const i of insts) {
    const sk = i.status === 'skipped' ? 1 : 0;
    const ov = isOverdue(i, today, nowMin) ? 1 : 0;
    const mv = i.moved ? 1 : 0;
    if (!sk && !ov && !mv) continue;
    const cur = m.get(i.task.id) ?? { title: i.task.title, skipped: 0, overdue: 0, moved: 0, total: 0 };
    cur.skipped += sk; cur.overdue += ov; cur.moved += mv; cur.total += sk + ov + mv;
    m.set(i.task.id, cur);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Минуты продуктивной работы по дням недели (0 = вс). */
export function minutesByWeekday(days: DayStat[]) {
  const arr = Array(7).fill(0) as number[];
  for (const d of days) arr[weekday(d.date)] += d.actualMin;
  return arr;
}

/** «Минимальный день»: только отмеченные как минимальные; если таких нет — 3 самых приоритетных. */
export function applyMinimal(insts: Instance[]) {
  const flagged = insts.filter((i) => i.task.minimal);
  if (flagged.length) return flagged;
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...insts].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 3);
}

/** Три важнейшие задачи дня: высокий приоритет, затем ранние по времени; выполненные — в конце. */
export function topThree(insts: Instance[]) {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return insts
    .filter((i) => isActive(i) && i.status !== 'skipped')
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || order[a.priority] - order[b.priority])
    .slice(0, 3);
}

/** Ближайшее незавершённое занятие (после текущего времени) сегодня. */
export function nextUp(insts: Instance[], today: ISODate, nowMin: number) {
  return insts
    .filter((i) => i.date === today && i.status === 'planned' && parseTime(i.startTime) !== null)
    .find((i) => (parseTime(i.startTime) as number) + i.durationMin >= nowMin);
}
