// Хадисы: открытый набор fawazahmed0/hadith-api (jsDelivr). Тексты отображаются без изменений.
import { cachedFirst } from '../content';
import type { CollectionKey } from './books';

const BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const RAW = 'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions';

export interface HadithRow {
  hadithnumber: number;
  arabicnumber?: number | string;
  text: string;
  grades?: { name: string; grade: string }[];
  reference?: { book: number; hadith: number };
}

interface SectionFile { hadiths: HadithRow[] }

export type TrLang = 'rus' | 'eng';

export async function getSection(coll: CollectionKey, book: number, ed: 'ara' | TrLang): Promise<HadithRow[]> {
  // Зеркала: jsDelivr иногда отвечает 403 на отдельные файлы — тогда берём уменьшенную версию или GitHub.
  const path = `${ed}-${coll}/sections/${book}`;
  const d = await cachedFirst<SectionFile>([`${BASE}/${path}.min.json`, `${BASE}/${path}.json`, `${RAW}/${path}.json`]);
  return d.hadiths;
}

/** Канонический номер для показа: у Муслима — номер Абд аль-Баки (783.02 → «783»), у Бухари — общий номер. */
export function canonicalNumber(h: Pick<HadithRow, 'hadithnumber' | 'arabicnumber'>): string {
  const a = h.arabicnumber;
  if (a === undefined || a === null || a === '') return String(h.hadithnumber);
  const s = String(a);
  return s.includes('.') ? s.split('.')[0] : s;
}

export const SOURCE_URL = 'https://github.com/fawazahmed0/hadith-api';
