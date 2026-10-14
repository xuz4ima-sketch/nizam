import Dexie, { type EntityTable } from 'dexie';
import type {
  DailyReview, Goal, Habit, HabitLog, Occurrence, Settings, StudyArea, StudySession, Task, TimerState,
} from './schema';

export class NizamDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  occurrences!: EntityTable<Occurrence, 'id'>;
  sessions!: EntityTable<StudySession, 'id'>;
  areas!: EntityTable<StudyArea, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  reviews!: EntityTable<DailyReview, 'date'>;
  settings!: EntityTable<Settings, 'id'>;
  timer!: EntityTable<TimerState, 'id'>;

  constructor(name = 'nizam') {
    super(name);
    this.version(1).stores({
      tasks: 'id, date, studyAreaId, goalId',
      occurrences: 'id, taskId, date, movedTo, status',
      sessions: 'id, date, areaId, taskId, occKey',
      areas: 'id',
      habits: 'id',
      habitLogs: 'id, habitId, date',
      goals: 'id, status',
      reviews: 'date',
      settings: 'id',
      timer: 'id',
    });
  }
}

export const db = new NizamDB();

export const TABLES = [
  'tasks', 'occurrences', 'sessions', 'areas', 'habits', 'habitLogs', 'goals', 'reviews', 'settings', 'timer',
] as const;
export type TableName = (typeof TABLES)[number];
