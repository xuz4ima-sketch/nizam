import { locale, t, tr } from '../i18n';
import type { AreaUnit, GoalType, HabitUnit, Priority, SkipReason, TaskStatus } from '../db/schema';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const SKIP_REASONS: Record<SkipReason, string> = tr({
  time: 'Нехватка времени',
  tired: 'Усталость',
  phone: 'Отвлечение на телефон',
  hard: 'Слишком сложная задача',
  unexpected: 'Непредвиденные обстоятельства',
  motivation: 'Отсутствие мотивации',
  other: 'Другая причина',
});

export const PRIORITIES: Record<Priority, string> = tr({ high: 'Высокий', medium: 'Средний', low: 'Низкий' });

export const STATUS_LABEL: Record<TaskStatus, string> = tr({
  planned: 'Запланировано', done: 'Выполнено', partial: 'Частично', skipped: 'Пропущено', cancelled: 'Отменено', deleted: 'Удалено',
});

export const CATEGORIES = ['Учёба', 'Работа', 'Чтение', 'Языки', 'Программирование', 'Спорт', 'Поклонение', 'Дом', 'Личное', 'Другое'];

export const AREA_UNITS: Record<AreaUnit, { label: string; short: string }> = tr({
  min: { label: 'Минуты', short: 'мин' },
  pages: { label: 'Страницы', short: 'стр.' },
  lessons: { label: 'Уроки', short: 'ур.' },
  chapters: { label: 'Главы', short: 'гл.' },
  words: { label: 'Слова', short: 'сл.' },
});

export const HABIT_UNITS: Record<HabitUnit, { label: string; short: string }> = tr({
  check: { label: 'Выполнено / не выполнено', short: '' },
  min: { label: 'Минуты', short: 'мин' },
  pages: { label: 'Страницы', short: 'стр.' },
  reps: { label: 'Повторения', short: 'раз' },
  glasses: { label: 'Стаканы', short: 'ст.' },
});

/** Спокойные цвета категорий (одинаковые в календаре, задачах и статистике). */
const CATEGORY_COLORS: Record<string, string> = {
  'Учёба': '#176B50', 'Работа': '#4F6D8A', 'Чтение': '#B08A4A', 'Языки': '#2F7F86', 'Программирование': '#5B5F97',
  'Спорт': '#B4664A', 'Поклонение': '#0C5A45', 'Дом': '#8A7556', 'Личное': '#7A5C82', 'Другое': '#6B7A73',
};
const EXTRA_COLORS = ['#3F7A63', '#7A6A3F', '#4A6F86', '#86574A', '#5E6E3F', '#6A5486'];
export function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  // категория могла быть сохранена на другом языке интерфейса
  const key = Object.keys(CATEGORY_COLORS).find((k) => t(k) === name);
  if (key) return CATEGORY_COLORS[key];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}

export const GOAL_TYPES: Record<GoalType, string> = tr({
  daily: 'Ежедневная', weekly: 'Недельная', monthly: 'Месячная', long: 'Долгосрочная',
});

export const AREA_COLORS = ['#176B50', '#2F7F86', '#4F6D8A', '#B08A4A', '#B4664A', '#5B5F97', '#3F7A63', '#6B7A73'];

export const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString(locale())}%`;
export const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString(locale());
