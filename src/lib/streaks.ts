// Серии и соблюдение привычек — вычисляются только из реальной истории отметок.
import type { Habit, HabitLog, ISODate } from '../db/schema';
import { addDays, dateRange, diffDays, maxISO, startOfWeek } from './dates';

export type DayState = 'done' | 'partial' | 'rest' | 'none';

export function dayState(h: Habit, log?: HabitLog): DayState {
  if (!log) return 'none';
  if (log.kind === 'rest' || log.kind === 'excused') return 'rest';
  if (log.value >= h.target) return 'done';
  return log.value > 0 ? 'partial' : 'none';
}

export interface HabitStats {
  current: number;
  best: number;
  rate: number; // соблюдение за период (0..1)
  doneDays: number;
  unit: 'дн.' | 'нед.';
}

export function logsMap(logs: HabitLog[], habitId: string) {
  const m = new Map<ISODate, HabitLog>();
  for (const l of logs) if (l.habitId === habitId) m.set(l.date, l);
  return m;
}

/** rateDays — окно для процента соблюдения (по умолчанию 30 дней). */
export function habitStats(h: Habit, logs: Map<ISODate, HabitLog>, today: ISODate, weekStart: 0 | 1, rateDays = 30): HabitStats {
  if (h.startDate > today) return { current: 0, best: 0, rate: 0, doneDays: 0, unit: h.frequency === 'weekly' ? 'нед.' : 'дн.' };
  return h.frequency === 'weekly' ? weeklyStats(h, logs, today, weekStart, rateDays) : dailyStats(h, logs, today, rateDays);
}

function dailyStats(h: Habit, logs: Map<ISODate, HabitLog>, today: ISODate, rateDays: number): HabitStats {
  let run = 0, best = 0, current = 0, doneDays = 0;
  for (const d of dateRange(h.startDate, today)) {
    const st = dayState(h, logs.get(d));
    if (st === 'done') { run++; doneDays++; }
    else if (st === 'rest') { /* день отдыха не прерывает серию */ }
    else if (d !== today) run = 0; // сегодняшний день ещё не закончен
    best = Math.max(best, run);
  }
  current = run;
  const from = maxISO(h.startDate, addDays(today, -(rateDays - 1)));
  let eligible = 0, ok = 0;
  for (const d of dateRange(from, today)) {
    const st = dayState(h, logs.get(d));
    if (st === 'rest') continue;
    if (d === today && st !== 'done') continue; // не штрафуем незаконченный день
    eligible++;
    if (st === 'done') ok++;
  }
  return { current, best, rate: eligible ? ok / eligible : 0, doneDays, unit: 'дн.' };
}

function weeklyStats(h: Habit, logs: Map<ISODate, HabitLog>, today: ISODate, weekStart: 0 | 1, rateDays: number): HabitStats {
  const need = Math.max(1, h.timesPerWeek);
  let run = 0, best = 0, doneDays = 0, eligible = 0, ok = 0;
  const thisWeek = startOfWeek(today, weekStart);
  const rateFrom = addDays(today, -(rateDays - 1));
  for (let w = startOfWeek(h.startDate, weekStart); w <= thisWeek; w = addDays(w, 7)) {
    let count = 0, rest = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d < h.startDate || d > today) continue;
      const st = dayState(h, logs.get(d));
      if (st === 'done') count++;
      if (st === 'rest') rest++;
    }
    doneDays += count;
    const success = count >= need || (rest >= 7 - need && count + rest >= 7);
    const current = w === thisWeek;
    if (success) run++;
    else if (!current) run = 0;
    best = Math.max(best, run);
    if (diffDays(addDays(w, 6), rateFrom) >= 0 && (!current || success)) {
      eligible++;
      if (success) ok++;
    }
  }
  return { current: run, best, rate: eligible ? ok / eligible : 0, doneDays, unit: 'нед.' };
}

/** Отметки текущей недели для недельной привычки. */
export function weekCount(h: Habit, logs: Map<ISODate, HabitLog>, today: ISODate, weekStart: 0 | 1) {
  const w = startOfWeek(today, weekStart);
  let c = 0;
  for (let i = 0; i < 7; i++) if (dayState(h, logs.get(addDays(w, i))) === 'done') c++;
  return c;
}

/** Привычки, актуальные сегодня: ежедневные — выполнены сегодня; недельные — выполнены сегодня или норма недели уже набрана. */
export function habitsToday(habits: Habit[], logs: HabitLog[], today: ISODate, weekStart: 0 | 1) {
  let done = 0, total = 0;
  for (const h of habits) {
    if (h.archived || h.startDate > today) continue;
    const m = logsMap(logs, h.id);
    const st = dayState(h, m.get(today));
    if (st === 'rest') continue;
    total++;
    if (st === 'done' || (h.frequency === 'weekly' && weekCount(h, m, today, weekStart) >= h.timesPerWeek)) done++;
  }
  return { done, total };
}
