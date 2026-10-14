import { describe, expect, it } from 'vitest';
import { parseQuick } from '../src/lib/quickadd';
import { fmtHijri, showTime, setTimeFormat } from '../src/lib/dates';
import { reminderFor, REMINDERS } from '../src/lib/reminders';
import { habitsToday } from '../src/lib/streaks';
import type { Habit, HabitLog } from '../src/db/schema';

const T = '2026-10-14';

describe('быстрое добавление', () => {
  it('«Арабский язык — 60 минут»', () => {
    expect(parseQuick('Арабский язык — 60 минут', T)).toEqual({ title: 'Арабский язык', durationMin: 60 });
  });
  it('часы, минуты, время, дата, категория, приоритет', () => {
    const r = parseQuick('Чтение книги завтра в 7:30 1 ч 30 мин #чтение !', T);
    expect(r).toEqual({ title: 'Чтение книги', durationMin: 90, startTime: '07:30', date: '2026-10-15', category: 'Чтение', priority: 'high' });
  });
  it('дробные часы и сокращения', () => {
    expect(parseQuick('Грамматика 1,5 ч', T).durationMin).toBe(90);
    expect(parseQuick('Спорт 20м', T)).toMatchObject({ title: 'Спорт', durationMin: 20 });
  });
  it('без длительности — только название; числа внутри названия не трогает', () => {
    expect(parseQuick('Прочитать 3 страницы', T)).toEqual({ title: 'Прочитать 3 страницы' });
  });
  it('некорректная длительность не принимается', () => {
    expect(parseQuick('Задача 5000 мин', T).durationMin).toBeUndefined();
  });
});

describe('даты и отображение', () => {
  it('дата по хиджре (Умм аль-Кура) совпадает с эталоном', () => {
    expect(fmtHijri('2025-01-26')).toBe('26 Раджаб 1446 г. х.');
  });
  it('формат 12/24 ч', () => {
    setTimeFormat('12');
    expect(showTime(13 * 60 + 5)).toBe('1:05 PM');
    expect(showTime(0)).toBe('12:00 AM');
    setTimeFormat('24');
    expect(showTime(13 * 60 + 5)).toBe('13:05');
  });
  it('напоминание дня стабильно и с источником', () => {
    expect(reminderFor(T)).toBe(reminderFor(T));
    for (const r of REMINDERS) expect(r.source.length).toBeGreaterThan(5);
  });
});

describe('привычки на сегодня', () => {
  const h = (id: string, extra: Partial<Habit> = {}): Habit => ({
    id, name: id, unit: 'check', target: 1, frequency: 'daily', timesPerWeek: 7, faith: false, startDate: '2026-10-01', archived: false, createdAt: 0, ...extra,
  });
  it('считает выполненные, пропускает дни отдыха и будущие', () => {
    const habits = [h('a'), h('b'), h('c'), h('d', { startDate: '2026-11-01' }), h('w', { frequency: 'weekly', timesPerWeek: 1 })];
    const logs: HabitLog[] = [
      { id: 'a|' + T, habitId: 'a', date: T, value: 1, kind: 'value' },
      { id: 'c|' + T, habitId: 'c', date: T, value: 0, kind: 'rest' },
      { id: 'w|2026-10-12', habitId: 'w', date: '2026-10-12', value: 1, kind: 'value' },
    ];
    expect(habitsToday(habits, logs, T, 1)).toEqual({ done: 2, total: 3 });
  });
});

import { findOverlaps, layoutDay } from '../src/lib/slots';
import type { Instance } from '../src/lib/recurrence';
describe('пересечения в календаре', () => {
  const mk = (key: string, startTime: string, durationMin: number, status: Instance['status'] = 'planned') =>
    ({ key, title: key, startTime, durationMin, status }) as unknown as Instance;
  it('находит пересечения и раскладывает по дорожкам', () => {
    const day = [mk('a', '09:00', 120), mk('b', '10:00', 30), mk('c', '10:45', 30), mk('d', '13:00', 30), mk('e', '10:15', 10, 'skipped')];
    expect(findOverlaps(day).map(([x, y]) => x.key + y.key)).toEqual(['ab', 'ac']);
    const l = layoutDay(day.slice(0, 4));
    expect(l.find((p) => p.inst.key === 'a')).toMatchObject({ lane: 0, lanes: 2 });
    expect(l.find((p) => p.inst.key === 'b')).toMatchObject({ lane: 1, lanes: 2 });
    expect(l.find((p) => p.inst.key === 'c')).toMatchObject({ lane: 1, lanes: 2 });
    expect(l.find((p) => p.inst.key === 'd')).toMatchObject({ lane: 0, lanes: 1 });
  });
});
