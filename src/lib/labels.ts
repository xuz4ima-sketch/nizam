import type { AreaUnit, GoalType, HabitUnit, Priority, SkipReason, TaskStatus } from '../db/schema';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const SKIP_REASONS: Record<SkipReason, string> = {
  time: 'Нехватка времени',
  tired: 'Усталость',
  phone: 'Отвлечение на телефон',
  hard: 'Слишком сложная задача',
  unexpected: 'Непредвиденные обстоятельства',
  motivation: 'Отсутствие мотивации',
  other: 'Другая причина',
};

export const PRIORITIES: Record<Priority, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

export const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: 'Запланировано', done: 'Выполнено', partial: 'Частично', skipped: 'Пропущено', cancelled: 'Отменено', deleted: 'Удалено',
};

export const CATEGORIES = ['Учёба', 'Работа', 'Чтение', 'Языки', 'Программирование', 'Спорт', 'Поклонение', 'Дом', 'Личное', 'Другое'];

export const AREA_UNITS: Record<AreaUnit, { label: string; short: string }> = {
  min: { label: 'Минуты', short: 'мин' },
  pages: { label: 'Страницы', short: 'стр.' },
  lessons: { label: 'Уроки', short: 'ур.' },
};

export const HABIT_UNITS: Record<HabitUnit, { label: string; short: string }> = {
  check: { label: 'Выполнено / не выполнено', short: '' },
  min: { label: 'Минуты', short: 'мин' },
  pages: { label: 'Страницы', short: 'стр.' },
  reps: { label: 'Повторения', short: 'раз' },
};

export const GOAL_TYPES: Record<GoalType, string> = {
  daily: 'Ежедневная', weekly: 'Недельная', monthly: 'Месячная', long: 'Долгосрочная',
};

export const AREA_COLORS = ['#047857', '#0e7490', '#4338ca', '#a16207', '#be123c', '#7c3aed', '#15803d', '#475569'];

export const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('ru-RU')}%`;
export const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
