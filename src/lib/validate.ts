import type { Recurrence } from '../db/schema';
import { isValidISO, parseTime } from './dates';

export type Errors = Record<string, string>;

export class ValidationError extends Error {
  constructor(public errors: Errors) {
    super(Object.values(errors)[0] ?? 'Проверьте введённые данные');
  }
}

export const MAX_TARGET = 100_000;

export function checkNumber(errors: Errors, key: string, v: unknown, { min = 0, max = MAX_TARGET, int = false, label = 'Значение' } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) errors[key] = `${label}: введите число`;
  else if (v < min) errors[key] = `${label}: не меньше ${min}`;
  else if (v > max) errors[key] = `${label}: не больше ${max}`;
  else if (int && !Number.isInteger(v)) errors[key] = `${label}: целое число`;
}

export function checkTitle(errors: Errors, key: string, v: unknown, label = 'Название') {
  if (typeof v !== 'string' || !v.trim()) errors[key] = `${label}: обязательное поле`;
  else if (v.length > 200) errors[key] = `${label}: не длиннее 200 символов`;
}

export function checkDate(errors: Errors, key: string, v: unknown, label = 'Дата', optional = false) {
  if (optional && (v === undefined || v === '')) return;
  if (!isValidISO(v)) errors[key] = `${label}: некорректная дата`;
}

export function checkTime(errors: Errors, key: string, v: unknown, label = 'Время') {
  if (v === undefined || v === '') return;
  if (typeof v !== 'string' || parseTime(v) === null) errors[key] = `${label}: формат ЧЧ:ММ`;
}

export function checkRecurrence(errors: Errors, r: Recurrence) {
  if (r.kind === 'weekdays' && (!r.days.length || r.days.some((d) => d < 0 || d > 6)))
    errors.recurrence = 'Выберите хотя бы один день недели';
  if (r.kind === 'interval') checkNumber(errors, 'recurrence', r.every, { min: 1, max: 365, int: true, label: 'Интервал' });
}

export function assertValid(errors: Errors) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}
