// Быстрое добавление: разбор строки вида «Арабский язык — 60 минут», «Чтение завтра в 7:30 1 ч 30 мин #Чтение !».
import type { ISODate, Priority } from '../db/schema';
import { addDays } from './dates';
import { CATEGORIES } from './labels';

export interface QuickParsed {
  title: string;
  durationMin?: number;
  startTime?: string;
  date?: ISODate;
  priority?: Priority;
  category?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseQuick(raw: string, today: ISODate): QuickParsed {
  let s = ` ${raw.trim()} `;
  const out: QuickParsed = { title: '' };

  // Категория: #Языки (сопоставляется со стандартной без учёта регистра)
  s = s.replace(/\s#([\p{L}\d_-]+)/gu, (_, c: string) => {
    const known = CATEGORIES.find((k) => k.toLowerCase() === c.toLowerCase());
    out.category = known ?? c.charAt(0).toUpperCase() + c.slice(1);
    return ' ';
  });
  // Высокий приоритет: «!» отдельным словом в конце/начале
  s = s.replace(/\s!+(?=\s)/g, () => { out.priority = 'high'; return ' '; });

  // Дата
  const DAY_WORDS: Record<string, number> = {
    'сегодня': 0, 'завтра': 1, 'послезавтра': 2, 'today': 0, 'tomorrow': 1, 'اليوم': 0, 'غدا': 1, 'غداً': 1, 'بعد غد': 2,
  };
  s = s.replace(/\s(послезавтра|сегодня|завтра|today|tomorrow|بعد غد|اليوم|غداً|غدا)(?=[\s,.;]|$)/giu, (_, w: string) => {
    out.date = addDays(today, DAY_WORDS[w.toLowerCase()] ?? 0);
    return ' ';
  });

  // Время начала: «в 9:00», «в 18.30», «09:00»
  s = s.replace(/\s(?:(?:в|at|في)\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=[\s,.;]|$)/giu, (_, h: string, m: string) => {
    out.startTime = `${pad(Number(h))}:${m}`;
    return ' ';
  });

  // Длительность: «1 ч 30 мин», «1,5 ч», «90 мин», «2 часа», «45м»
  const durRe = /\s(\d+(?:[.,]\d+)?)\s*(ч|час|часа|часов|h|hr|hrs|hours?|ساعة|ساعات)\.?(?:\s*(\d+)\s*(м|мин|минут|минуты|min|mins|minutes?|دقيقة|دقائق)\.?)?(?=[\s,.;]|$)|\s(\d+)\s*(м|мин|минут|минуты|min|mins|minutes?|دقيقة|دقائق)\.?(?=[\s,.;]|$)/iu;
  const dm = s.match(durRe);
  if (dm) {
    let min = 0;
    if (dm[1]) min = Math.round(Number(dm[1].replace(',', '.')) * 60) + (dm[3] ? Number(dm[3]) : 0);
    else if (dm[5]) min = Number(dm[5]);
    if (min > 0 && min <= 1440) { out.durationMin = min; s = s.replace(dm[0], ' '); }
  }

  out.title = s.replace(/\s+/g, ' ').replace(/^[\s—–\-:,;.]+|[\s—–\-:,;]+$/g, '').trim();
  return out;
}
