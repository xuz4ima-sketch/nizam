// Типизированные сущности НИЗАМ. Даты дня — строки 'YYYY-MM-DD' в часовом поясе пользователя,
// метки времени — миллисекунды epoch (UTC).

export type ISODate = string;
export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'planned' | 'done' | 'partial' | 'skipped' | 'cancelled' | 'deleted';
export type SkipReason = 'time' | 'tired' | 'phone' | 'hard' | 'unexpected' | 'motivation' | 'other';

export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = воскресенье … 6 = суббота
  | { kind: 'interval'; every: number }; // каждые N дней

/** Задача или серия повторяющихся задач (шаблон). Статусы конкретных дней — в Occurrence. */
export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  date: ISODate; // дата (для серии — дата начала)
  endDate?: ISODate; // окончание серии
  startTime?: string; // 'HH:MM', необязательно
  durationMin: number; // желательная продолжительность
  priority: Priority;
  recurrence: Recurrence;
  goalId?: string;
  studyAreaId?: string;
  minimal: boolean; // входит в «Минимальный день»
  createdAt: number;
  updatedAt: number;
}

/** Экземпляр задачи в конкретный день. id = `${taskId}|${date}`. Изменения одного дня не трогают серию. */
export interface Occurrence {
  id: string;
  taskId: string;
  date: ISODate; // исходная дата по расписанию
  status: TaskStatus;
  movedTo?: ISODate; // если перенесено на другой день
  startTime?: string; // переопределения только для этого дня
  title?: string;
  description?: string;
  durationMin?: number;
  skipReason?: SkipReason;
  skipNote?: string;
  moveCount?: number;
  updatedAt: number;
}

/** Единственный источник фактического времени/объёма. Одна запись = один вклад (без двойного счёта). */
export interface StudySession {
  id: string;
  date: ISODate;
  areaId?: string;
  taskId?: string;
  occKey?: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  amount?: number; // страницы/уроки, если направление их считает
  source: 'timer' | 'manual' | 'task';
  distractions?: { at: number; reason: string }[];
  note?: string;
}

export type AreaUnit = 'min' | 'pages' | 'lessons' | 'chapters' | 'words';
export interface StudyArea {
  id: string;
  name: string;
  description: string;
  unit: AreaUnit;
  dailyTarget: number;
  weeklyTarget: number; // 0 = 7 × дневная норма
  totalTarget: number; // общая цель, 0 = нет
  faith: boolean; // раздел добровольного поклонения и религиозной учёбы
  carryOver: boolean; // разрешить перенос недовыполненного (только по подтверждению)
  extra: Record<ISODate, number>; // подтверждённая компенсация на конкретный день
  color: string;
  createdAt: number;
}

export type HabitUnit = 'check' | 'min' | 'pages' | 'reps' | 'glasses';
export interface Habit {
  id: string;
  name: string;
  unit: HabitUnit;
  target: number; // дневная цель (для check = 1)
  frequency: 'daily' | 'weekly';
  timesPerWeek: number; // для weekly
  faith: boolean;
  startDate: ISODate;
  icon?: string; // ключ иконки из HABIT_ICONS
  color?: string;
  archived: boolean;
  createdAt: number;
}

/** id = `${habitId}|${date}` */
export interface HabitLog {
  id: string;
  habitId: string;
  date: ISODate;
  value: number;
  kind: 'value' | 'rest' | 'excused';
}

export type GoalType = 'daily' | 'weekly' | 'monthly' | 'long';
export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  unit: string;
  target: number;
  initial: number; // уже выполнено к началу (например, прочитанные страницы)
  source: 'manual' | 'area' | 'tasks';
  areaId?: string;
  log: { date: ISODate; value: number }[];
  startDate: ISODate;
  endDate: ISODate;
  status: 'active' | 'done' | 'archived';
  note: string;
  createdAt: number;
}

export interface DailyReview {
  date: ISODate;
  achieved: string;
  missed: string;
  obstacles: string;
  improve: string;
  rating: number; // 0 = не указано, 1..5
  updatedAt: number;
}

export interface Settings {
  id: 'main';
  name: string;
  language: 'ru';
  theme: 'system' | 'light' | 'dark';
  timeZone: string;
  weekStart: 0 | 1;
  notifications: boolean;
  dayStart: string;
  dayEnd: string;
  pomodoroWork: number;
  pomodoroBreak: number;
  minimalDate?: ISODate; // дата, на которую включён «Минимальный день»
  lastBackupAt?: number;
  maxCarryRatio: number; // максимум компенсации относительно дневной нормы (0.5 = +50%)
  greetTitle: string; // заголовок приветствия на главной
  greetText: string;
  showReminder: boolean; // показывать проверенное напоминание (аят/хадис с источником)
  showHijri: boolean;
  timeFormat: '24' | '12';
}

export interface TimerState {
  id: 'current';
  mode: 'free' | 'pomodoro' | 'five';
  phase: 'work' | 'break';
  label: string;
  taskId?: string;
  occKey?: string;
  areaId?: string;
  sessionStartedAt: number;
  runningSince: number | null; // null = пауза
  accumulatedMs: number;
  distractions: { at: number; reason: string }[];
  completedPomodoros: number;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  name: '',
  language: 'ru',
  theme: 'system',
  timeZone: 'Africa/Cairo',
  weekStart: 1,
  notifications: false,
  dayStart: '07:00',
  dayEnd: '23:00',
  pomodoroWork: 25,
  pomodoroBreak: 5,
  maxCarryRatio: 0.5,
  greetTitle: 'Ас-саляму алейкум!',
  greetText: 'Сегодня хороший день, чтобы сделать ещё один шаг к своим целям.',
  showReminder: true,
  showHijri: true,
  timeFormat: '24',
};
