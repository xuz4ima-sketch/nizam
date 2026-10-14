// Коран через открытый API Quran.com (Quran Foundation): текст Усмани (мединский мусхаф, 604 страницы),
// перевод смыслов Э. Кулиева (id 45), Saheeh International (id 20), тафсир ас-Саади: русский (170), арабский (91),
// аль-Муяссар (16), чтение Мишари аль-Афаси (recitation 7).
import { cachedJSON } from '../content';
import type { Lang } from '../../db/schema';

export const API = 'https://api.quran.com/api/v4';
export const AUDIO_BASE = 'https://verses.quran.com/';
export const PAGES = 604;
/** Первые страницы джузов мединского мусхафа (проверено по API). */
export const JUZ_PAGES = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];

export const TRANSLATIONS = { ru: 45, en: 20 } as const;
export const TAFSIRS = {
  saadi_ru: { id: 170, lang: 'ru', name: 'Тафсир ас-Саади (рус.)' },
  saadi_ar: { id: 91, lang: 'ar', name: 'تفسير السعدي' },
  muyassar: { id: 16, lang: 'ar', name: 'التفسير الميسر' },
} as const;
export type TafsirKey = keyof typeof TAFSIRS;
export const RECITER = { id: 7, name: 'Мишари Рашид аль-Афаси' };

export interface Chapter {
  id: number;
  name_arabic: string;
  name_simple: string;
  translated_name: { name: string };
  verses_count: number;
  pages: [number, number];
  revelation_place: 'makkah' | 'madinah';
  bismillah_pre: boolean;
}

export interface Verse {
  id: number;
  verse_key: string;
  verse_number: number;
  text_uthmani: string;
  page_number: number;
  juz_number: number;
  translations?: { resource_id: number; text: string }[];
}

const chapterLang = (l: Lang) => (l === 'ar' ? 'ar' : l === 'en' ? 'en' : 'ru');

export async function getChapters(l: Lang): Promise<Chapter[]> {
  const d = await cachedJSON<{ chapters: Chapter[] }>(`${API}/chapters?language=${chapterLang(l)}`);
  return d.chapters;
}

export async function getPage(page: number): Promise<Verse[]> {
  const d = await cachedJSON<{ verses: Verse[] }>(`${API}/verses/by_page/${page}?fields=text_uthmani,page_number,juz_number,chapter_id&per_page=50`);
  return d.verses;
}

type Paged = { pagination?: { total_pages: number } } & Record<string, unknown>;

/** Все страницы постраничного ответа API. */
async function allPages<T>(urlFor: (page: number) => string, key: string): Promise<T[]> {
  const first = await cachedJSON<Paged>(urlFor(1));
  const out = [...(first[key] as T[])];
  const total = first.pagination?.total_pages ?? 1;
  const rest = await Promise.all(Array.from({ length: Math.max(0, total - 1) }, (_, i) => cachedJSON<Paged>(urlFor(i + 2))));
  for (const d of rest) out.push(...(d[key] as T[]));
  return out;
}

export function getSurahVerses(ch: number, translation?: number): Promise<Verse[]> {
  const tr = translation ? `&translations=${translation}` : '';
  return allPages<Verse>((p) => `${API}/verses/by_chapter/${ch}?fields=text_uthmani,page_number,juz_number${tr}&per_page=50&page=${p}`, 'verses');
}

export interface TafsirRow { verse_key: string; text: string }
export function getSurahTafsir(ch: number, tafsirId: number): Promise<TafsirRow[]> {
  return allPages<TafsirRow>((p) => `${API}/tafsirs/${tafsirId}/by_chapter/${ch}?per_page=50&page=${p}`, 'tafsirs');
}

export async function getSurahAudio(ch: number): Promise<Map<string, string>> {
  const rows = await allPages<{ verse_key: string; url: string }>((p) => `${API}/recitations/${RECITER.id}/by_chapter/${ch}?per_page=50&page=${p}`, 'audio_files');
  return new Map(rows.map((r) => [r.verse_key, r.url.startsWith('http') ? r.url : AUDIO_BASE + r.url.replace(/^\/+/, '')]));
}

/** URL страницы мусхафа — для проверки, сохранена ли она офлайн. */
export const pageUrl = (page: number) => `${API}/verses/by_page/${page}?fields=text_uthmani,page_number,juz_number,chapter_id&per_page=50`;

/** Перевод: убрать сноски и HTML (Saheeh International содержит <sup>). */
export const plainTranslation = (html: string) => html.replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]+>/g, '').trim();
