// Работа с датами без внешних библиотек. День пользователя вычисляется по выбранному часовому поясу.
import type { ISODate } from '../db/schema';

const DAY = 86_400_000;
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Дата и минуты от полуночи для момента `ms` в часовом поясе `tz`. */
export function zonedParts(ms: number, tz: string): { date: ISODate; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of partsFormatter(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export const isoFromMs = (ms: number, tz: string) => zonedParts(ms, tz).date;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toUTC = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  if (y < 1970 || y > 2200) return false;
  return new Date(toUTC(s)).toISOString().slice(0, 10) === s;
}

export const addDays = (iso: ISODate, n: number): ISODate => new Date(toUTC(iso) + n * DAY).toISOString().slice(0, 10);
/** a − b в днях */
export const diffDays = (a: ISODate, b: ISODate) => Math.round((toUTC(a) - toUTC(b)) / DAY);
export const weekday = (iso: ISODate) => new Date(toUTC(iso)).getUTCDay();
export const startOfWeek = (iso: ISODate, weekStart: 0 | 1) => addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
export const startOfMonth = (iso: ISODate) => iso.slice(0, 8) + '01';
export const endOfMonth = (iso: ISODate) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const maxISO = (a: ISODate, b: ISODate) => (a > b ? a : b);
export const minISO = (a: ISODate, b: ISODate) => (a < b ? a : b);

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (!isValidISO(from) || !isValidISO(to)) return out;
  for (let d = from, i = 0; d <= to && i < 3700; d = addDays(d, 1), i++) out.push(d);
  return out;
}

export function fmtDate(iso: ISODate, opts: Intl.DateTimeFormatOptions) {
  const s = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...opts }).format(new Date(toUTC(iso)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const fmtLong = (iso: ISODate) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = (iso: ISODate) => fmtDate(iso, { day: 'numeric', month: 'short' });
export const fmtWeekdayShort = (iso: ISODate) => fmtDate(iso, { weekday: 'short' });

const pad = (n: number) => String(n).padStart(2, '0');
export function parseTime(t: string | undefined): number | null {
  if (!t || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
}
export const fmtTime = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export function fmtMinutes(m: number) {
  const v = Math.round(m);
  if (v < 60) return `${v} мин`;
  const h = Math.floor(v / 60), r = v % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const WEEKDAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/* ---------- Отображение времени (12/24 ч) — только для показа, поля ввода всегда 24 ч ---------- */
let h12 = false;
export const setTimeFormat = (f: '24' | '12') => { h12 = f === '12'; };
export function showTime(min: number) {
  if (!h12) return fmtTime(min);
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
export const showTimeStr = (t?: string) => { const v = parseTime(t); return v === null ? '' : showTime(v); };

/* ---------- Дата по хиджре: календарь Умм аль-Кура (Intl), возможна разница ±1 день с местным началом месяца ---------- */
let hijriFmt: Intl.DateTimeFormat | null | undefined;
export const HIJRI_METHOD = 'Умм аль-Кура';
export function fmtHijri(iso: ISODate): string | null {
  if (hijriFmt === undefined) {
    try {
      const f = new Intl.DateTimeFormat('ru-RU-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
      hijriFmt = f.resolvedOptions().calendar === 'islamic-umalqura' ? f : null;
    } catch { hijriFmt = null; }
  }
  if (!hijriFmt) return null;
  const p: Record<string, string> = {};
  for (const x of hijriFmt.formatToParts(new Date(toUTC(iso)))) p[x.type] = x.value;
  if (!p.day || !p.month || !p.year) return null;
  const month = p.month.charAt(0).toUpperCase() + p.month.slice(1);
  return `${p.day} ${month} ${p.year} г. х.`;
}
