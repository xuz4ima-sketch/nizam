// Переводы интерфейса. Ключ — исходная русская строка; словари en/ar сопоставляют её переводу.
// t() работает в любом модуле (не только в компонентах): при смене языка дерево приложения монтируется заново.
import type { Lang } from '../db/schema';

type Dict = Record<string, string>;

let lang: Lang = 'ru';
let dict: Dict = {};
const missing = new Set<string>();

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'ar', label: 'العربية', short: 'ع' },
  { code: 'en', label: 'English', short: 'EN' },
];

export const getLang = () => lang;
export const isRTL = () => lang === 'ar';
/** Локаль для Intl: арабский — с латинскими цифрами, чтобы числа в интерфейсе были единообразны. */
export const locale = () => (lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'ar-u-nu-latn');

const loaders: Record<Exclude<Lang, 'ru'>, () => Promise<{ default: Dict }>> = {
  en: () => import('./en.json'),
  ar: () => import('./ar.json'),
};

/** Загружает словарь и делает язык текущим. */
export async function loadLang(l: Lang) {
  dict = l === 'ru' ? {} : (await loaders[l]()).default;
  lang = l;
  missing.clear();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }
  try { localStorage.setItem('nizam-lang', l); } catch { /* недоступно */ }
}

/** Перевод строки. Позиционные подстановки: t('Выполнено {0} из {1}', a, b). */
export function t(key: string, ...args: (string | number)[]): string {
  let s = key;
  if (lang !== 'ru') {
    const v = dict[key];
    if (v !== undefined) s = v;
    else if (import.meta.env?.DEV && !missing.has(key)) { missing.add(key); console.debug('[i18n] нет перевода:', lang, key); }
  }
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? '')) : s;
}

/** Переводит значения словаря-констант при чтении (для модульных констант вроде меток статусов). */
export function tr<T extends Record<string, unknown>>(obj: T): T {
  return new Proxy(obj, {
    get(target, key, recv) {
      const v = Reflect.get(target, key, recv);
      if (typeof v === 'string') return t(v);
      if (v && typeof v === 'object' && !Array.isArray(v)) return tr(v as Record<string, unknown>);
      return v;
    },
  });
}

/** Собранные в режиме разработки ключи без перевода (для проверки словарей). */
export const missingKeys = () => [...missing];
