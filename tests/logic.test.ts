import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog, Occurrence, StudyArea, StudySession, Task } from '../src/db/schema';
import { addDays, diffDays, isValidISO, startOfWeek, zonedParts } from '../src/lib/dates';
import { completion, expand, indexSessions, isOverdue, occKey } from '../src/lib/recurrence';
import { areaProgress, goalProgress } from '../src/lib/progress';
import { habitStats, logsMap } from '../src/lib/streaks';
import { findFreeSlot } from '../src/lib/slots';
import { dayStat } from '../src/lib/stats';

const task = (p: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Чтение', description: '', category: 'Чтение', date: '2026-10-12', durationMin: 60, priority: 'medium',
  recurrence: { kind: 'none' }, minimal: false, createdAt: 0, updatedAt: 0, ...p,
});
const NOIDX = indexSessions([]);

describe('даты и часовой пояс', () => {
  it('арифметика дат', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2026-11-01', '2026-10-25')).toBe(7);
    expect(startOfWeek('2026-10-14', 1)).toBe('2026-10-12'); // среда → понедельник
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('2026-02-28')).toBe(true);
  });
  it('день определяется по выбранному поясу (сценарий 10)', () => {
    const ms = Date.UTC(2026, 9, 14, 22, 30); // 22:30 UTC
    expect(zonedParts(ms, 'UTC').date).toBe('2026-10-14');
    expect(zonedParts(ms, 'Africa/Cairo').date).toBe('2026-10-15'); // UTC+3 летом/UTC+2 зимой — уже следующий день
    expect(zonedParts(ms, 'America/New_York').date).toBe('2026-10-14');
    expect(zonedParts(Date.UTC(2026, 9, 14, 5, 7), 'Europe/Moscow').minutes).toBe(8 * 60 + 7);
  });
});

describe('повторяющиеся задачи (сценарий 3)', () => {
  it('ежедневная задача появляется каждый день, начиная с даты начала', () => {
    const t = task({ recurrence: { kind: 'daily' } });
    const list = expand([t], [], NOIDX, '2026-10-10', '2026-10-16');
    expect(list.map((i) => i.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });
  it('по дням недели и с интервалом, с датой окончания', () => {
    const wd = task({ recurrence: { kind: 'weekdays', days: [1, 3] } }); // пн, ср
    expect(expand([wd], [], NOIDX, '2026-10-12', '2026-10-25').map((i) => i.date)).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
    const iv = task({ recurrence: { kind: 'interval', every: 3 }, endDate: '2026-10-20' });
    expect(expand([iv], [], NOIDX, '2026-10-01', '2026-10-31').map((i) => i.date)).toEqual(['2026-10-12', '2026-10-15', '2026-10-18']);
  });
  it('изменение, перенос и удаление одного экземпляра не трогают серию', () => {
    const t = task({ recurrence: { kind: 'daily' } });
    const occs: Occurrence[] = [
      { id: occKey('t1', '2026-10-13'), taskId: 't1', date: '2026-10-13', status: 'planned', title: 'Особый день', updatedAt: 0 },
      { id: occKey('t1', '2026-10-14'), taskId: 't1', date: '2026-10-14', status: 'planned', movedTo: '2026-10-20', updatedAt: 0 },
      { id: occKey('t1', '2026-10-15'), taskId: 't1', date: '2026-10-15', status: 'deleted', updatedAt: 0 },
    ];
    const list = expand([t], occs, NOIDX, '2026-10-12', '2026-10-16');
    expect(list.map((i) => `${i.date}:${i.title}`)).toEqual(['2026-10-12:Чтение', '2026-10-13:Особый день', '2026-10-16:Чтение']);
    const moved = expand([t], occs, NOIDX, '2026-10-20', '2026-10-20');
    expect(moved).toHaveLength(2); // собственный экземпляр 20-го + перенесённый с 14-го
    expect(moved.filter((i) => i.moved)[0].origDate).toBe('2026-10-14');
  });
  it('просроченная задача не считается выполненной; частичное — пропорционально', () => {
    const [i] = expand([task({ startTime: '08:00' })], [], NOIDX, '2026-10-12', '2026-10-12');
    expect(isOverdue(i, '2026-10-12', 10 * 60)).toBe(true);
    expect(isOverdue(i, '2026-10-12', 8 * 60 + 30)).toBe(false);
    expect(completion(i)).toBe(0);
    const s: StudySession = { id: 's', date: '2026-10-12', occKey: i.key, startedAt: 0, endedAt: 0, minutes: 15, source: 'timer' };
    const [p] = expand([task({ startTime: '08:00' })], [], indexSessions([s]), '2026-10-12', '2026-10-12');
    expect(completion(p)).toBe(0.25);
    const st = dayStat('2026-10-12', [p], [s], '2026-10-12', 12 * 60);
    expect(st.overdue).toBe(1);
    expect(st.done).toBe(0);
    expect(st.actualMin).toBe(15);
  });
});

describe('учебные направления и цели (сценарий 4)', () => {
  const area: StudyArea = {
    id: 'a1', name: 'Перевод', description: '', unit: 'min', dailyTarget: 120, weeklyTarget: 0, totalTarget: 0,
    faith: false, carryOver: true, extra: {}, color: '#000', createdAt: Date.UTC(2026, 0, 1),
  };
  const sess = (date: string, minutes: number): StudySession => ({ id: Math.random().toString(), date, areaId: 'a1', startedAt: 0, endedAt: 0, minutes, source: 'manual' });

  it('120 мин цель, 30 мин → 25%', () => {
    expect(areaProgress(area, [sess('2026-10-14', 30)], '2026-10-14', 1).pctToday).toBe(0.25);
  });
  it('45 мин → 37,5% и остаток 75; +30 мин → 62,5%', () => {
    const s1 = [sess('2026-10-14', 45)];
    const p1 = areaProgress(area, s1, '2026-10-14', 1);
    expect(p1.pctToday).toBe(0.375);
    expect(p1.remainingToday).toBe(75);
    const p2 = areaProgress(area, [...s1, sess('2026-10-14', 30)], '2026-10-14', 1);
    expect(p2.doneToday).toBe(75);
    expect(p2.pctToday).toBe(0.625);
  });
  it('долг вчерашнего дня считается только при включённой компенсации', () => {
    expect(areaProgress(area, [sess('2026-10-13', 100)], '2026-10-14', 1).yesterdayDeficit).toBe(20);
    expect(areaProgress({ ...area, carryOver: false }, [sess('2026-10-13', 100)], '2026-10-14', 1).yesterdayDeficit).toBe(0);
  });
  it('цель «прочитать книгу за 5 дней»: остаток и темп', () => {
    const g = { id: 'g', title: 'Книга', type: 'weekly' as const, unit: 'стр.', target: 300, initial: 50, source: 'manual' as const, log: [], startDate: '2026-10-14', endDate: '2026-10-18', status: 'active' as const, note: '', createdAt: 0 };
    const p = goalProgress(g, 50, '2026-10-14');
    expect(p.remaining).toBe(250);
    expect(p.daysLeft).toBe(5);
    expect(p.pace).toBe(50);
    expect(goalProgress(g, 300, '2026-10-16').state).toBe('done');
    expect(goalProgress(g, 100, '2026-10-19').state).toBe('overdue');
  });
});

describe('привычки: серии из реальной истории', () => {
  const h: Habit = { id: 'h', name: 'Чтение', unit: 'pages', target: 10, frequency: 'daily', timesPerWeek: 7, faith: false, startDate: '2026-10-01', archived: false, createdAt: 0 };
  const log = (date: string, value: number, kind: HabitLog['kind'] = 'value'): HabitLog => ({ id: `h|${date}`, habitId: 'h', date, value, kind });
  it('день отдыха не прерывает серию, незаконченный сегодняшний день не обнуляет её', () => {
    const logs = logsMap([log('2026-10-10', 12), log('2026-10-11', 0, 'rest'), log('2026-10-12', 10), log('2026-10-13', 15)], 'h');
    const s = habitStats(h, logs, '2026-10-14', 1);
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });
  it('пропущенный день обнуляет серию; частичное значение не засчитывается', () => {
    const logs = logsMap([log('2026-10-10', 12), log('2026-10-11', 5), log('2026-10-12', 10)], 'h');
    const s = habitStats(h, logs, '2026-10-12', 1);
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });
});

describe('поиск свободного времени', () => {
  it('находит окно между занятиями', () => {
    const list = expand([task({ id: 'a', startTime: '07:00', durationMin: 60 }), task({ id: 'b', startTime: '08:30', durationMin: 60 })], [], NOIDX, '2026-10-12', '2026-10-12');
    expect(findFreeSlot(list, 30, '07:00', '23:00')).toBe(8 * 60);
    expect(findFreeSlot(list, 45, '07:00', '23:00')).toBe(9 * 60 + 30);
    expect(findFreeSlot(list, 30, '07:00', '08:00')).toBe(null);
  });
});
