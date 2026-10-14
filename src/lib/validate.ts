import type { Recurrence } from '../db/schema';
import { isValidISO, parseTime } from './dates';

import { t as T } from '../i18n';
export type Errors = Record<string, string>;

export class ValidationError extends Error {
  constructor(public errors: Errors) {
    super(Object.values(errors)[0] ?? T('Проверьте введённые данные'));
  }
}

export const MAX_TARGET = 100_000;

export function checkNumber(errors: Errors, key: string, v: unknown, { min = 0, max = MAX_TARGET, int = false, label = T('Значение') } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) errors[key] = T('{0}: введите число', label);
  else if (v < min) errors[key] = T('{0}: не меньше {1}', label, min);
  else if (v > max) errors[key] = T('{0}: не больше {1}', label, max);
  else if (int && !Number.isInteger(v)) errors[key] = T('{0}: целое число', label);
}

export function checkTitle(errors: Errors, key: string, v: unknown, label = T('Название')) {
  if (typeof v !== 'string' || !v.trim()) errors[key] = T('{0}: обязательное поле', label);
  else if (v.length > 200) errors[key] = T('{0}: не длиннее 200 символов', label);
}

export function checkDate(errors: Errors, key: string, v: unknown, label = T('Дата'), optional = false) {
  if (optional && (v === undefined || v === '')) return;
  if (!isValidISO(v)) errors[key] = T('{0}: некорректная дата', label);
}

export function checkTime(errors: Errors, key: string, v: unknown, label = T('Время')) {
  if (v === undefined || v === '') return;
  if (typeof v !== 'string' || parseTime(v) === null) errors[key] = T('{0}: формат ЧЧ:ММ', label);
}

export function checkRecurrence(errors: Errors, r: Recurrence) {
  if (r.kind === 'weekdays' && (!r.days.length || r.days.some((d) => d < 0 || d > 6)))
    errors.recurrence = T('Выберите хотя бы один день недели');
  if (r.kind === 'interval') checkNumber(errors, 'recurrence', r.every, { min: 1, max: 365, int: true, label: T('Интервал') });
}

export function assertValid(errors: Errors) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}
