// Прогресс учебных направлений и целей — строго из сохранённых сессий и отметок.
import type { Goal, ISODate, Occurrence, StudyArea, StudySession, Task } from '../db/schema';
import { addDays, diffDays, isoFromMs, startOfWeek } from './dates';

export const areaValue = (s: StudySession, area: Pick<StudyArea, 'unit'>) => (area.unit === 'min' ? s.minutes : s.amount ?? 0);

export function areaDone(area: StudyArea, sessions: StudySession[], from: ISODate, to: ISODate) {
  let v = 0;
  for (const s of sessions) if (s.areaId === area.id && s.date >= from && s.date <= to) v += areaValue(s, area);
  return v;
}

export const areaTargetFor = (area: StudyArea, date: ISODate) => area.dailyTarget + (area.extra?.[date] ?? 0);

export interface AreaProgress {
  doneToday: number;
  targetToday: number;
  remainingToday: number;
  pctToday: number; // 0..1+
  weekDone: number;
  weekTarget: number;
  total: number;
  totalPct: number;
  yesterdayDeficit: number; // недовыполнено вчера (только если включена компенсация)
  extraToday: number;
}

export function areaProgress(area: StudyArea, sessions: StudySession[], today: ISODate, weekStart: 0 | 1, tz = 'UTC'): AreaProgress {
  const doneToday = areaDone(area, sessions, today, today);
  const targetToday = areaTargetFor(area, today);
  const ws = startOfWeek(today, weekStart);
  const weekDone = areaDone(area, sessions, ws, addDays(ws, 6));
  const weekTarget = area.weeklyTarget > 0 ? area.weeklyTarget : area.dailyTarget * 7;
  const total = areaDone(area, sessions, '1970-01-01', '9999-12-31');
  const y = addDays(today, -1);
  const createdBeforeYesterday = isoFromMs(area.createdAt, tz) <= y;
  const yesterdayDeficit = area.carryOver && createdBeforeYesterday
    ? Math.max(0, areaTargetFor(area, y) - areaDone(area, sessions, y, y)) : 0;
  return {
    doneToday, targetToday, remainingToday: Math.max(0, targetToday - doneToday),
    pctToday: targetToday > 0 ? doneToday / targetToday : 0,
    weekDone, weekTarget, total, totalPct: area.totalTarget > 0 ? total / area.totalTarget : 0,
    yesterdayDeficit, extraToday: area.extra?.[today] ?? 0,
  };
}

export interface GoalProgress {
  done: number;
  remaining: number;
  pct: number;
  daysTotal: number;
  daysLeft: number; // включая сегодня
  pace: number; // необходимый средний темп в день
  expected: number; // ожидаемое значение к сегодняшнему дню при равномерном темпе
  state: 'done' | 'overdue' | 'behind' | 'ontrack' | 'upcoming';
}

export function goalDone(g: Goal, ctx: { sessions: StudySession[]; areas: StudyArea[]; occurrences: Occurrence[]; tasks: Task[] }) {
  let v = g.initial;
  if (g.source === 'manual') v += g.log.reduce((a, l) => a + l.value, 0);
  else if (g.source === 'area') {
    const area = ctx.areas.find((a) => a.id === g.areaId);
    if (area) v += areaDone(area, ctx.sessions, g.startDate, g.endDate);
  } else {
    const ids = new Set(ctx.tasks.filter((t) => t.goalId === g.id).map((t) => t.id));
    for (const o of ctx.occurrences) {
      const d = o.movedTo ?? o.date;
      if (o.status === 'done' && ids.has(o.taskId) && d >= g.startDate && d <= g.endDate) v++;
    }
  }
  return Math.max(0, v);
}

export function goalProgress(g: Goal, done: number, today: ISODate): GoalProgress {
  const daysTotal = Math.max(1, diffDays(g.endDate, g.startDate) + 1);
  const remaining = Math.max(0, g.target - done);
  const pct = Math.min(1, done / g.target);
  let daysLeft: number;
  if (today < g.startDate) daysLeft = daysTotal;
  else daysLeft = Math.max(0, diffDays(g.endDate, today) + 1);
  const pace = daysLeft > 0 ? remaining / daysLeft : remaining;
  const elapsed = today < g.startDate ? 0 : Math.min(daysTotal, diffDays(today, g.startDate) + 1);
  const expected = (g.target * elapsed) / daysTotal;
  let state: GoalProgress['state'];
  if (done >= g.target) state = 'done';
  else if (today > g.endDate) state = 'overdue';
  else if (today < g.startDate) state = 'upcoming';
  else state = done + 1e-9 >= expected - g.target / daysTotal ? 'ontrack' : 'behind';
  return { done, remaining, pct, daysTotal, daysLeft, pace, expected, state };
}
