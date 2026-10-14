import type { TafsirKey } from './api';

export interface QuranPref {
  lastPage: number;
  lastSurah: number;
  lastAyah: number;
  pageMarks: number[];
  ayahMarks: string[]; // «сура:аят»
  mushafFont: number;
  arFont: number;
  trFont: number;
  tafsirFont: number;
  showTranslation: boolean;
  showTafsir: boolean;
  expandTafsir: boolean;
  tafsir: TafsirKey;
  repeat: number; // повтор аята при прослушивании (для заучивания), 0 = без повтора
}

export const QURAN_PREF: QuranPref = {
  lastPage: 1, lastSurah: 1, lastAyah: 1, pageMarks: [], ayahMarks: [],
  mushafFont: 28, arFont: 30, trFont: 16, tafsirFont: 15,
  showTranslation: true, showTafsir: true, expandTafsir: false, tafsir: 'saadi_ru', repeat: 0,
};
