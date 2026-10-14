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
  s = s.replace(/\s(сегодня|завтра|послезавтра)(?=[\s,.;]|$)/giu, (_, w: string) => {
    const k = w.toLowerCase();
    out.date = k === 'сегодня' ? today : addDays(today, k === 'завтра' ? 1 : 2);
    return ' ';
  });

  // Время начала: «в 9:00», «в 18.30», «09:00»
  s = s.replace(/\s(?:в\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=[\s,.;]|$)/giu, (_, h: string, m: string) => {
    out.startTime = `${pad(Number(h))}:${m}`;
    return ' ';
  });

  // Длительность: «1 ч 30 мин», «1,5 ч», «90 мин», «2 часа», «45м»
  const durRe = /\s(\d+(?:[.,]\d+)?)\s*(ч|час|часа|часов|h)\.?(?:\s*(\d+)\s*(м|мин|минут|минуты|min)\.?)?(?=[\s,.;]|$)|\s(\d+)\s*(м|мин|минут|минуты|min)\.?(?=[\s,.;]|$)/iu;
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
