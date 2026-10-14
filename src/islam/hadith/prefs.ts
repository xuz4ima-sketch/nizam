export interface HadithPref {
  arFont: number;
  trFont: number;
  showArabic: boolean;
  showTranslation: boolean;
  marks: string[]; // «сборник:номер в издании»
  last: Record<string, number>; // последняя открытая книга по сборнику
}

export const HADITH_PREF: HadithPref = { arFont: 22, trFont: 16, showArabic: true, showTranslation: true, marks: [], last: {} };
