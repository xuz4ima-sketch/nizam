import { afterAll, describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { loadLang, locale, t, tr } from '../src/i18n';
import { canonicalNumber } from '../src/islam/hadith/api';
import { BUKHARI, MUSLIM } from '../src/islam/hadith/books';
import { units, type TextDoc } from '../src/islam/library/texts';
import { REMINDERS, reminderMeaning } from '../src/lib/reminders';
import timeData from '../src/data/hadith-time.json';
import { arabicDigits } from '../src/islam/content';

import bayquni from '../src/data/texts/bayquni.json';
import tuhfa from '../src/data/texts/tuhfa.json';
import jazariya from '../src/data/texts/jazariya.json';
import nawawi40 from '../src/data/texts/nawawi40.json';
import usul3 from '../src/data/texts/usul3.json';

const TEXTS: Record<string, unknown> = { bayquni, tuhfa, jazariya, nawawi40, usul3 };
const text = (id: string) => TEXTS[id] as TextDoc;

describe('переводы интерфейса', () => {
  afterAll(() => loadLang('ru'));
  it('словари en и ar покрывают одни и те же ключи, подстановки совпадают', () => {
    const ph = (s: string) => [...s.matchAll(/\{\d\}/g)].map((m) => m[0]).sort().join();
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    for (const [k, v] of Object.entries(en)) expect(ph(v as string), k).toBe(ph(k));
    for (const [k, v] of Object.entries(ar)) expect(ph(v as string), k).toBe(ph(k));
  });
  it('t() подставляет значения, tr() переводит константы при чтении', async () => {
    expect(t('{0} из {1}', 3, 5)).toBe('3 из 5');
    const labels = tr({ a: 'Выполнено', nested: { label: 'Минуты' } });
    await loadLang('en');
    expect(t('{0} из {1}', 3, 5)).toBe('3 of 5');
    expect(labels.a).toBe('Done');
    expect(labels.nested.label).toBe('Minutes');
    expect(locale()).toBe('en-GB');
    await loadLang('ar');
    expect(t('Коран')).toBe('القرآن');
    expect(t('Строка без перевода')).toBe('Строка без перевода');
  });
});

describe('тексты мутунов', () => {
  it('число бейтов совпадает с самими текстами', () => {
    const count = (id: string) => text(id).sections.flatMap((s) => s.items).filter((i) => i.t === 'b').length;
    expect(count('bayquni')).toBe(34); // «فوق الثلاثين بأربع أتت»
    expect(count('tuhfa')).toBe(61);
    expect(count('jazariya')).toBeGreaterThanOrEqual(107);
  });
  it('«Сорок хадисов» — 42 раздела, без неподписанного шарха', () => {
    const d = text('nawawi40');
    expect(d.sections).toHaveLength(42);
    expect(JSON.stringify(d)).not.toContain('شرح وفوائد');
  });
  it('единицы заучивания имеют сквозные индексы, источник указан', () => {
    const d = text('usul3');
    const u = units(d);
    expect(u.map((x) => x.idx)).toEqual(u.map((_, i) => i));
    expect(d.source.url).toMatch(/^https:\/\/ar\.wikisource\.org\/w\/index\.php\?oldid=\d+$/);
    expect(d.source.license).toBe('CC BY-SA 4.0');
  });
});

describe('хадисы и напоминания', () => {
  it('канонический номер Муслима по нумерации Абд аль-Баки', () => {
    expect(canonicalNumber({ hadithnumber: 1830, arabicnumber: '783.02' })).toBe('783');
    expect(canonicalNumber({ hadithnumber: 6412, arabicnumber: 6412 })).toBe('6412');
    expect(canonicalNumber({ hadithnumber: 5 })).toBe('5');
  });
  it('справочник книг: 97 у аль-Бухари, 57 у Муслима, диапазоны возрастают', () => {
    expect(BUKHARI).toHaveLength(97);
    expect(MUSLIM).toHaveLength(57);
    for (const b of [...BUKHARI, ...MUSLIM]) expect(b.to).toBeGreaterThanOrEqual(b.from);
  });
  it('подборка о времени: проверенные канонические номера, есть арабский текст', () => {
    const items = (timeData as { items: { collection: string; number: number; canonical: string; ar: string }[] }).items;
    const muslim = items.filter((h) => h.collection === 'muslim').map((h) => h.canonical).sort();
    expect(muslim).toEqual(['118', '2664']);
    for (const h of items) expect(h.ar.length).toBeGreaterThan(20);
  });
  it('у каждого напоминания есть источник на трёх языках и перевод из источника', () => {
    for (const r of REMINDERS) {
      expect(r.source.ru && r.source.en && r.source.ar).toBeTruthy();
      expect(reminderMeaning(r, 'ru')).toBeTruthy();
      expect(reminderMeaning(r, 'ar')).toBeNull();
    }
  });
  it('арабско-индийские цифры для номеров аятов', () => {
    expect(arabicDigits(286)).toBe('٢٨٦');
  });
});
