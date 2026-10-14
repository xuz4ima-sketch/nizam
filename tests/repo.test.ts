import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import {
  completeInstance, deleteInstance, deleteTask, finishTimer, moveInstance, pauseTimer, resetInstance, resumeTimer, saveSettings,
  saveTask, skipInstance, startTimer, timerElapsed, type TaskInput,
} from '../src/db/repo';
import { clearAll, exportAll, importAll, validateBackup } from '../src/db/backup';
import { expand, indexSessions } from '../src/lib/recurrence';
import { seedDemoPlan } from '../src/db/seed';
import { ValidationError } from '../src/lib/validate';

const base: TaskInput = {
  title: 'Программирование', description: '', category: 'Учёба', date: '2026-10-14', durationMin: 60, priority: 'high',
  recurrence: { kind: 'none' }, minimal: false,
};

async function instances(from: string, to = from) {
  const [tasks, occs, sessions] = await Promise.all([db.tasks.toArray(), db.occurrences.toArray(), db.sessions.toArray()]);
  return expand(tasks, occs, indexSessions(sessions), from, to);
}

beforeEach(async () => { await clearAll(false); });
afterEach(() => { vi.restoreAllMocks(); });

describe('задачи: создание, изменение, удаление (сценарии 1, 2)', () => {
  it('создаёт и сохраняет задачу, изменения сохраняются', async () => {
    const id = await saveTask(base);
    expect((await db.tasks.get(id))?.title).toBe('Программирование');
    await saveTask({ ...base, title: 'Программирование: React', startTime: '10:00' }, id);
    const t = await db.tasks.get(id);
    expect(t?.title).toBe('Программирование: React');
    expect(t?.startTime).toBe('10:00');
  });
  it('отклоняет некорректные значения', async () => {
    await expect(saveTask({ ...base, title: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveTask({ ...base, durationMin: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveTask({ ...base, date: '2026-13-40' })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveTask({ ...base, durationMin: Infinity })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveTask({ ...base, recurrence: { kind: 'weekdays', days: [] } })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.tasks.count()).toBe(0);
  });
  it('удаление задачи удаляет экземпляры и учтённое время', async () => {
    const id = await saveTask(base);
    const [i] = await instances('2026-10-14');
    await completeInstance(i);
    expect(await db.sessions.count()).toBe(1);
    await deleteTask(id);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.occurrences.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('выполнение без двойного счёта', () => {
  it('таймер 20 мин + отметка «выполнено» = 60 мин, повторная отметка не добавляет', async () => {
    await saveTask(base);
    const [i] = await instances('2026-10-14');
    await db.sessions.add({ id: 'timer1', date: '2026-10-14', taskId: i.task.id, occKey: i.key, startedAt: 0, endedAt: 0, minutes: 20, source: 'timer' });
    await completeInstance(i);
    await completeInstance(i);
    const sum = (await db.sessions.toArray()).reduce((a, s) => a + s.minutes, 0);
    expect(sum).toBe(60);
    const [after] = await instances('2026-10-14');
    expect(after.status).toBe('done');
    expect(after.doneMin).toBe(60);
  });
  it('частичное выполнение 30 из 60 → 50%, сброс убирает добавленное время', async () => {
    await saveTask(base);
    const [i] = await instances('2026-10-14');
    await completeInstance(i, { totalMin: 30, status: 'partial' });
    const [p] = await instances('2026-10-14');
    expect(p.status).toBe('partial');
    expect(p.doneMin / p.durationMin).toBe(0.5);
    await resetInstance(p);
    const [r] = await instances('2026-10-14');
    expect(r.status).toBe('planned');
    expect(r.doneMin).toBe(0);
  });
});

describe('повторения, пропуск и перенос (сценарии 3, 6)', () => {
  it('пропуск с причиной и ручной перенос одного дня серии', async () => {
    await saveTask({ ...base, recurrence: { kind: 'daily' } });
    let [d14] = await instances('2026-10-14');
    await skipInstance(d14, 'tired', 'плохо спал');
    [d14] = await instances('2026-10-14');
    expect(d14.status).toBe('skipped');
    expect(d14.skipReason).toBe('tired');
    await moveInstance(d14, '2026-10-16', '18:00');
    expect(await instances('2026-10-14')).toHaveLength(0);
    const d16 = await instances('2026-10-16');
    expect(d16).toHaveLength(2);
    expect(d16.find((i) => i.moved)?.startTime).toBe('18:00');
    expect((await instances('2026-10-15'))[0].status).toBe('planned'); // серия не тронута
  });
  it('удаление одного дня серии не удаляет остальные', async () => {
    await saveTask({ ...base, recurrence: { kind: 'daily' } });
    const [d15] = await instances('2026-10-15');
    await deleteInstance(d15);
    expect((await instances('2026-10-14', '2026-10-16')).map((i) => i.date)).toEqual(['2026-10-14', '2026-10-16']);
  });
});

describe('таймер по временным меткам (сценарий 5)', () => {
  it('старт → пауза → продолжение → завершение сохраняет фактическое время', async () => {
    let t = Date.UTC(2026, 9, 14, 8, 0);
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    await saveSettings({ timeZone: 'Africa/Cairo' });
    await startTimer({ mode: 'free', label: 'Арабский' });
    t += 10 * 60_000;
    await pauseTimer();
    t += 30 * 60_000; // на паузе время не идёт
    const paused = await db.timer.get('current');
    expect(timerElapsed(paused!, t)).toBe(10 * 60_000);
    await resumeTimer();
    t += 15 * 60_000;
    const saved = await finishTimer();
    expect(saved).toBe(25);
    const [s] = await db.sessions.toArray();
    expect(s.minutes).toBe(25);
    expect(s.date).toBe('2026-10-14');
    expect(await db.timer.get('current')).toBeUndefined();
  });
  it('нельзя запустить второй сеанс одновременно', async () => {
    await startTimer({ mode: 'free', label: 'A' });
    await expect(startTimer({ mode: 'free', label: 'B' })).rejects.toThrow();
  });
});

describe('резервная копия (сценарий 7)', () => {
  it('экспорт → удаление → импорт восстанавливает данные', async () => {
    await seedDemoPlan('2026-10-14');
    await saveTask(base);
    const before = await exportAll();
    expect(before.data.tasks).toHaveLength(8);
    await clearAll(false);
    expect(await db.tasks.count()).toBe(0);
    const json = JSON.parse(JSON.stringify(before));
    await importAll(json);
    expect(await db.tasks.count()).toBe(8);
    expect(await db.areas.count()).toBe(7);
  });
  it('отклоняет чужой или повреждённый файл, не трогая данные', async () => {
    await saveTask(base);
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup({ app: 'nizam', schemaVersion: 1, data: { tasks: [{ id: 1 }] } }).ok).toBe(false);
    await expect(importAll({ app: 'other' })).rejects.toThrow();
    expect(await db.tasks.count()).toBe(1);
  });
  it('демо-план не дублируется при повторной установке', async () => {
    expect(await seedDemoPlan('2026-10-14')).toBe(7);
    expect(await seedDemoPlan('2026-10-14')).toBe(0);
  });
});

describe('пустая база (сценарий 9)', () => {
  it('разворачивание и экспорт на пустой базе работают без ошибок', async () => {
    expect(await instances('2026-10-01', '2026-10-31')).toEqual([]);
    const b = await exportAll();
    expect(validateBackup(JSON.parse(JSON.stringify(b))).ok).toBe(true);
  });
});
