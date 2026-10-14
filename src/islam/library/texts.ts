// Тексты мутунов и книг (собраны скриптом scripts/texts/build_texts.py из арабской Викитеки, CC BY-SA 4.0).
// Каждый текст — отдельный чанк: загружается при открытии и сохраняется для офлайна вместе с приложением.
import index from '../../data/texts/index.json';

export type Item = { t: 'p'; text: string } | { t: 'b'; s: string; a: string };
export interface Section { title: string; items: Item[] }
export interface TextDoc {
  id: string; title: string; author: string; category: string; kind: 'poem' | 'prose'; vocalized?: boolean;
  source: { name: string; page: string; revid: number; url: string; license: string };
  sections: Section[];
}
export interface TextMeta { id: string; title: string; author: string; category: string; kind: 'poem' | 'prose'; sections: number; abyat: number; paragraphs: number }

export const TEXTS = index as TextMeta[];

const modules = import.meta.glob<{ default: TextDoc }>('../../data/texts/*.json');

export async function loadText(id: string): Promise<TextDoc> {
  const m = modules[`../../data/texts/${id}.json`];
  if (!m || id === 'index') throw new Error('not-found');
  return (await m()).default;
}

/** Единица заучивания: бейт или абзац, со сквозным индексом. */
export interface Unit { idx: number; section: number; item: Item }
export function units(doc: TextDoc): Unit[] {
  const out: Unit[] = [];
  doc.sections.forEach((s, si) => s.items.forEach((item) => out.push({ idx: out.length, section: si, item })));
  return out;
}
export const unitText = (it: Item) => (it.t === 'b' ? `${it.s} ${it.a}` : it.text);
export const unitCount = (m: TextMeta) => m.abyat + m.paragraphs;

/** Разделы библиотеки; «мутуны» — тексты для заучивания (стихи и короткие трактаты). */
export const CATEGORIES: Record<string, { ru: string; ar: string; en: string }> = {
  aqida: { ru: 'Акыда', ar: 'العقيدة', en: 'Aqidah' },
  hadith: { ru: 'Хадис и мусталах', ar: 'الحديث ومصطلحه', en: 'Hadith' },
  arabic: { ru: 'Арабский язык', ar: 'اللغة العربية', en: 'Arabic' },
  tajwid: { ru: 'Таджвид', ar: 'التجويد', en: 'Tajwid' },
};

export const MUTUN_IDS = ['usul3', 'qawaid4', 'nawaqid', 'nawawi40', 'bayquni', 'ajurrumiya', 'tuhfa', 'jazariya', 'wasitiya', 'tahawiya', 'lumah', 'kashf'];

/** Русские пояснения к названиям (метки интерфейса). */
export const RU_TITLES: Record<string, string> = {
  usul3: 'Три основы', qawaid4: 'Четыре правила', nawaqid: 'Нарушители ислама', kashf: 'Раскрытие сомнений',
  wasitiya: 'аль-Акыда аль-Васитыйя', tahawiya: 'аль-Акыда ат-Тахавийя', lumah: 'Люм‘ат аль-и‘тикад',
  nawawi40: 'Сорок хадисов ан-Навави', bayquni: 'Байкуния (мусталах)', ajurrumiya: 'Аджуррумийя (грамматика)',
  tuhfa: 'Тухфат аль-атфаль (таджвид)', jazariya: 'аль-Мукаддима аль-Джазария (таджвид)',
};
export const EN_TITLES: Record<string, string> = {
  usul3: 'The Three Fundamental Principles', qawaid4: 'The Four Principles', nawaqid: 'Nullifiers of Islam', kashf: 'Removal of the Doubts',
  wasitiya: 'Al-Aqidah al-Wasitiyyah', tahawiya: 'Al-Aqidah at-Tahawiyyah', lumah: "Lum'at al-I'tiqad",
  nawawi40: "An-Nawawi's Forty Hadith", bayquni: 'Al-Bayquniyyah', ajurrumiya: 'Al-Ajurrumiyyah',
  tuhfa: 'Tuhfat al-Atfal', jazariya: 'Al-Muqaddimah al-Jazariyyah',
};
