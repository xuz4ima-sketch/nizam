// Напоминание дня: аяты и хадисы, где и арабский текст, и переводы взяты из источников
// (scripts/hadith/build_reminders.py: Quran.com API — Кулиев/Saheeh International; fawazahmed0/hadith-api).
import type { ISODate, Lang } from '../db/schema';
import { diffDays } from './dates';
import data from '../data/reminders.json';

export interface Reminder {
  kind: 'quran' | 'hadith';
  ar: string;
  ru: string | null;
  en: string | null;
  source: Record<Lang, string>;
}

export const REMINDERS = (data as { items: Reminder[] }).items;

/** Одно напоминание на день — стабильно в течение дня, меняется ежедневно. */
export function reminderFor(date: ISODate): Reminder {
  const n = diffDays(date, '2024-01-01');
  return REMINDERS[((n % REMINDERS.length) + REMINDERS.length) % REMINDERS.length];
}

/** Перевод на язык интерфейса (для арабского — без перевода). */
export function reminderMeaning(r: Reminder, lang: Lang): string | null {
  if (lang === 'ar') return null;
  return lang === 'en' ? r.en : (r.ru ?? r.en);
}
