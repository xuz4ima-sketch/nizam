import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  DEFAULT_SETTINGS, type DailyReview, type Goal, type Habit, type HabitLog, type ISODate, type Occurrence,
  type Settings, type StudyArea, type StudySession, type Task, type TimerState,
} from '../db/schema';
import { isValidTimeZone, zonedParts } from '../lib/dates';
import { expand, indexSessions, type SessionIndex } from '../lib/recurrence';

export interface AppData {
  settings: Settings;
  tasks: Task[];
  occurrences: Occurrence[];
  sessions: StudySession[];
  areas: StudyArea[];
  habits: Habit[];
  habitLogs: HabitLog[];
  goals: Goal[];
  reviews: DailyReview[];
  timer?: TimerState;
  sidx: SessionIndex;
  today: ISODate;
  nowMin: number;
  nowMs: number;
}

const Ctx = createContext<AppData | null>(null);

async function loadAll() {
  const [s, tasks, occurrences, sessions, areas, habits, habitLogs, goals, reviews, timer] = await Promise.all([
    db.settings.get('main'), db.tasks.toArray(), db.occurrences.toArray(), db.sessions.toArray(), db.areas.toArray(),
    db.habits.toArray(), db.habitLogs.toArray(), db.goals.toArray(), db.reviews.toArray(), db.timer.get('current'),
  ]);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...s, id: 'main' };
  if (!isValidTimeZone(settings.timeZone)) settings.timeZone = DEFAULT_SETTINGS.timeZone;
  areas.sort((a, b) => a.createdAt - b.createdAt);
  habits.sort((a, b) => a.createdAt - b.createdAt);
  goals.sort((a, b) => a.createdAt - b.createdAt);
  return { settings, tasks, occurrences, sessions, areas, habits, habitLogs, goals, reviews, timer };
}

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const raw = useLiveQuery(loadAll, []);
  const [nowMs, setNow] = useState(() => Date.now());

  // Обновление «сейчас»: смена дня и просрочки пересчитываются без перезагрузки.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const theme = raw?.settings.theme ?? 'system';
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1110' : '#065f46');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo<AppData | null>(() => {
    if (!raw) return null;
    const { date, minutes } = zonedParts(nowMs, raw.settings.timeZone);
    return { ...raw, sidx: indexSessions(raw.sessions), today: date, nowMin: minutes, nowMs };
  }, [raw, nowMs]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider отсутствует');
  return v;
}

export function useInstances(from: ISODate, to: ISODate) {
  const { tasks, occurrences, sidx } = useData();
  return useMemo(() => expand(tasks, occurrences, sidx, from, to), [tasks, occurrences, sidx, from, to]);
}

/** Тикает раз в секунду — только для экранов с живым таймером. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
