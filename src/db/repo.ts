// Единая точка изменения данных. Все разделы работают через эти функции и общую БД.
// Для будущей облачной синхронизации достаточно заменить реализацию этого модуля адаптером.
import { db } from './db';
import {
  DEFAULT_SETTINGS, type DailyReview, type Goal, type Habit, type HabitLog, type ISODate, type Occurrence,
  type Settings, type SkipReason, type StudyArea, type StudySession, type Task, type TimerState,
} from './schema';
import { addDays, isValidTimeZone, isoFromMs, parseTime } from '../lib/dates';
import { occKey, type Instance } from '../lib/recurrence';
import { uid } from '../lib/labels';
import {
  assertValid, checkDate, checkNumber, checkRecurrence, checkTime, checkTitle, type Errors,
} from '../lib/validate';

const now = () => Date.now();

/* ---------- Настройки ---------- */

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('main');
  return { ...DEFAULT_SETTINGS, ...s, id: 'main' };
}

export async function saveSettings(patch: Partial<Settings>) {
  const errors: Errors = {};
  if (patch.timeZone !== undefined && !isValidTimeZone(patch.timeZone)) errors.timeZone = 'Неизвестный часовой пояс';
  if (patch.pomodoroWork !== undefined) checkNumber(errors, 'pomodoroWork', patch.pomodoroWork, { min: 1, max: 180, int: true, label: 'Работа' });
  if (patch.pomodoroBreak !== undefined) checkNumber(errors, 'pomodoroBreak', patch.pomodoroBreak, { min: 1, max: 60, int: true, label: 'Отдых' });
  if (patch.dayStart !== undefined) checkTime(errors, 'dayStart', patch.dayStart, 'Начало дня');
  if (patch.dayEnd !== undefined) checkTime(errors, 'dayEnd', patch.dayEnd, 'Конец дня');
  if (patch.name !== undefined && patch.name.length > 60) errors.name = 'Имя: не длиннее 60 символов';
  assertValid(errors);
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'main' });
}

const tz = async () => (await getSettings()).timeZone;

/* ---------- Задачи ---------- */

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

export function validateTask(t: TaskInput): Errors {
  const e: Errors = {};
  checkTitle(e, 'title', t.title);
  checkDate(e, 'date', t.date);
  checkDate(e, 'endDate', t.endDate, 'Дата окончания', true);
  if (!e.date && !e.endDate && t.endDate && t.endDate < t.date) e.endDate = 'Окончание раньше начала';
  checkTime(e, 'startTime', t.startTime, 'Время начала');
  checkNumber(e, 'durationMin', t.durationMin, { min: 1, max: 1440, int: true, label: 'Продолжительность' });
  checkRecurrence(e, t.recurrence);
  if (t.description.length > 2000) e.description = 'Описание: не длиннее 2000 символов';
  return e;
}

export async function saveTask(input: TaskInput, id?: string): Promise<string> {
  assertValid(validateTask(input));
  const clean: TaskInput = {
    ...input,
    title: input.title.trim(),
    startTime: input.startTime || undefined,
    endDate: input.recurrence.kind === 'none' ? undefined : input.endDate || undefined,
  };
  if (id) {
    const cur = await db.tasks.get(id);
    if (!cur) throw new Error('Задача не найдена');
    await db.tasks.put({ ...cur, ...clean, id, updatedAt: now() });
    return id;
  }
  const nid = uid();
  await db.tasks.add({ ...clean, id: nid, createdAt: now(), updatedAt: now() });
  return nid;
}

/** Удаляет задачу/серию целиком вместе с экземплярами и связанным учётом времени. */
export async function deleteTask(id: string) {
  await db.transaction('rw', [db.tasks, db.occurrences, db.sessions, db.timer], async () => {
    await db.tasks.delete(id);
    await db.occurrences.where('taskId').equals(id).delete();
    await db.sessions.where('taskId').equals(id).delete();
    const t = await db.timer.get('current');
    if (t?.taskId === id) await db.timer.put({ ...t, taskId: undefined, occKey: undefined });
  });
}

async function upsertOcc(inst: Pick<Instance, 'key' | 'task' | 'origDate'>, patch: Partial<Occurrence>) {
  const cur = await db.occurrences.get(inst.key);
  const base: Occurrence = cur ?? { id: inst.key, taskId: inst.task.id, date: inst.origDate, status: 'planned', updatedAt: now() };
  await db.occurrences.put({ ...base, ...patch, id: inst.key, updatedAt: now() });
}

/** Отмечает выполнение. totalMin — фактическое общее время; недостающее к уже учтённому таймером
 *  записывается одной «task»-сессией (перезаписывается, а не добавляется — без двойного счёта). */
export async function completeInstance(
  inst: Instance,
  opts: { totalMin?: number; amount?: number; status?: 'done' | 'partial' } = {},
) {
  const errors: Errors = {};
  if (opts.totalMin !== undefined) checkNumber(errors, 'totalMin', opts.totalMin, { min: 0, max: 1440, label: 'Минуты' });
  if (opts.amount !== undefined) checkNumber(errors, 'amount', opts.amount, { min: 0, label: 'Объём' });
  assertValid(errors);
  const fillerId = `t|${inst.key}`;
  await db.transaction('rw', [db.sessions, db.occurrences], async () => {
    const linked = await db.sessions.where('occKey').equals(inst.key).toArray();
    const other = linked.filter((s) => s.id !== fillerId);
    const tracked = other.reduce((a, s) => a + s.minutes, 0);
    const trackedAmount = other.reduce((a, s) => a + (s.amount ?? 0), 0);
    let status = opts.status ?? 'done';
    const total = opts.totalMin ?? (status === 'done' ? Math.max(tracked, inst.durationMin) : tracked);
    if (status === 'partial' && total >= inst.durationMin) status = 'done';
    const filler = Math.max(0, Math.round(total - tracked));
    const fillerAmount = Math.max(0, (opts.amount ?? trackedAmount) - trackedAmount);
    if (filler > 0 || fillerAmount > 0) {
      const t = now();
      await db.sessions.put({
        id: fillerId, date: inst.date, areaId: inst.task.studyAreaId, taskId: inst.task.id, occKey: inst.key,
        startedAt: t - filler * 60_000, endedAt: t, minutes: filler, amount: fillerAmount || undefined, source: 'task',
      });
    } else await db.sessions.delete(fillerId);
    await upsertOcc(inst, { status, skipReason: undefined, skipNote: undefined });
  });
}

/** Возвращает экземпляр в «запланировано» и убирает учёт, добавленный отметкой выполнения. */
export async function resetInstance(inst: Instance) {
  await db.transaction('rw', [db.sessions, db.occurrences], async () => {
    await db.sessions.delete(`t|${inst.key}`);
    await upsertOcc(inst, { status: 'planned', skipReason: undefined, skipNote: undefined });
  });
}

export async function skipInstance(inst: Instance, reason: SkipReason, note = '') {
  await upsertOcc(inst, { status: 'skipped', skipReason: reason, skipNote: note.slice(0, 500) || undefined });
}

export async function cancelInstance(inst: Instance) {
  await upsertOcc(inst, { status: 'cancelled' });
}

/** Перенос одного экземпляра (только по действию пользователя). */
export async function moveInstance(inst: Instance, date: ISODate, startTime?: string) {
  const e: Errors = {};
  checkDate(e, 'date', date);
  checkTime(e, 'startTime', startTime);
  assertValid(e);
  const cur = await db.occurrences.get(inst.key);
  await upsertOcc(inst, {
    movedTo: date === inst.origDate ? undefined : date,
    startTime: startTime || undefined,
    status: inst.status === 'done' ? 'done' : 'planned',
    moveCount: (cur?.moveCount ?? 0) + 1,
  });
  await db.sessions.where('occKey').equals(inst.key).modify((s) => {
    if (s.source === 'task') s.date = date;
  });
}

/** Изменение только одного дня повторяющейся задачи. */
export async function editInstance(inst: Instance, patch: { title: string; description: string; startTime?: string; durationMin: number }) {
  const e: Errors = {};
  checkTitle(e, 'title', patch.title);
  checkTime(e, 'startTime', patch.startTime);
  checkNumber(e, 'durationMin', patch.durationMin, { min: 1, max: 1440, int: true, label: 'Продолжительность' });
  assertValid(e);
  await upsertOcc(inst, {
    title: patch.title.trim() === inst.task.title ? undefined : patch.title.trim(),
    description: patch.description === inst.task.description ? undefined : patch.description,
    startTime: patch.startTime || undefined,
    durationMin: patch.durationMin === inst.task.durationMin ? undefined : patch.durationMin,
  });
}

/** Удаление одного дня. Для одиночной задачи удаляется задача целиком. */
export async function deleteInstance(inst: Instance) {
  if (inst.task.recurrence.kind === 'none') return deleteTask(inst.task.id);
  await db.transaction('rw', [db.sessions, db.occurrences], async () => {
    await db.sessions.where('occKey').equals(inst.key).delete();
    await upsertOcc(inst, { status: 'deleted' });
  });
}

/* ---------- Учебные направления и сессии ---------- */

export type AreaInput = Omit<StudyArea, 'id' | 'createdAt' | 'extra'>;

export function validateArea(a: AreaInput): Errors {
  const e: Errors = {};
  checkTitle(e, 'name', a.name);
  checkNumber(e, 'dailyTarget', a.dailyTarget, { min: 0, max: 10_000, label: 'Дневная норма' });
  checkNumber(e, 'weeklyTarget', a.weeklyTarget, { min: 0, max: 70_000, label: 'Недельный план' });
  checkNumber(e, 'totalTarget', a.totalTarget, { min: 0, max: 10_000_000, label: 'Общая цель' });
  return e;
}

export async function saveArea(a: AreaInput, id?: string): Promise<string> {
  assertValid(validateArea(a));
  if (id) {
    const cur = await db.areas.get(id);
    if (!cur) throw new Error('Направление не найдено');
    await db.areas.put({ ...cur, ...a, name: a.name.trim(), id });
    return id;
  }
  const nid = uid();
  await db.areas.add({ ...a, name: a.name.trim(), id: nid, extra: {}, createdAt: now() });
  return nid;
}

export async function deleteArea(id: string) {
  await db.transaction('rw', [db.areas, db.sessions, db.tasks, db.goals], async () => {
    await db.areas.delete(id);
    await db.sessions.where('areaId').equals(id).modify((s) => { delete s.areaId; });
    await db.tasks.where('studyAreaId').equals(id).modify((t) => { delete t.studyAreaId; });
    await db.goals.filter((g) => g.areaId === id).modify((g) => { g.areaId = undefined; g.source = 'manual'; });
  });
}

export async function addManualSession(p: { areaId?: string; date: ISODate; minutes: number; amount?: number; note?: string }) {
  const e: Errors = {};
  checkDate(e, 'date', p.date);
  checkNumber(e, 'minutes', p.minutes, { min: 0, max: 1440, label: 'Минуты' });
  if (p.amount !== undefined) checkNumber(e, 'amount', p.amount, { min: 0, max: 10_000, label: 'Объём' });
  if (!e.minutes && !e.amount && p.minutes === 0 && !p.amount) e.minutes = 'Укажите время или объём';
  assertValid(e);
  const t = now();
  const id = uid();
  await db.sessions.add({
    id, date: p.date, areaId: p.areaId, startedAt: t - p.minutes * 60_000, endedAt: t,
    minutes: p.minutes, amount: p.amount || undefined, source: 'manual', note: p.note?.slice(0, 500) || undefined,
  });
  return id;
}

export const deleteSession = (id: string) => db.sessions.delete(id);

/** Подтверждённая пользователем компенсация недовыполненной нормы (с ограничением нагрузки). */
export async function acceptCarry(areaId: string, date: ISODate, amount: number) {
  const a = await db.areas.get(areaId);
  if (!a) throw new Error('Направление не найдено');
  const s = await getSettings();
  const cap = Math.round(a.dailyTarget * s.maxCarryRatio);
  const v = Math.max(0, Math.min(cap, Math.round(amount)));
  await db.areas.update(areaId, { extra: { ...a.extra, [date]: v } });
  return v;
}

export async function clearCarry(areaId: string, date: ISODate) {
  const a = await db.areas.get(areaId);
  if (!a) return;
  const extra = { ...a.extra };
  delete extra[date];
  await db.areas.update(areaId, { extra });
}

/* ---------- Привычки ---------- */

export type HabitInput = Omit<Habit, 'id' | 'createdAt' | 'archived'>;

export function validateHabit(h: HabitInput): Errors {
  const e: Errors = {};
  checkTitle(e, 'name', h.name);
  checkNumber(e, 'target', h.target, { min: 1, max: 10_000, label: 'Цель' });
  if (h.frequency === 'weekly') checkNumber(e, 'timesPerWeek', h.timesPerWeek, { min: 1, max: 7, int: true, label: 'Раз в неделю' });
  checkDate(e, 'startDate', h.startDate, 'Дата начала');
  return e;
}

export async function saveHabit(h: HabitInput, id?: string) {
  const clean = { ...h, name: h.name.trim(), target: h.unit === 'check' ? 1 : h.target };
  assertValid(validateHabit(clean));
  if (id) {
    const cur = await db.habits.get(id);
    if (!cur) throw new Error('Привычка не найдена');
    await db.habits.put({ ...cur, ...clean, id });
    return id;
  }
  const nid = uid();
  await db.habits.add({ ...clean, id: nid, archived: false, createdAt: now() });
  return nid;
}

export async function deleteHabit(id: string) {
  await db.transaction('rw', [db.habits, db.habitLogs], async () => {
    await db.habits.delete(id);
    await db.habitLogs.where('habitId').equals(id).delete();
  });
}

export async function setHabitLog(habitId: string, date: ISODate, value: number, kind: HabitLog['kind'] = 'value') {
  const e: Errors = {};
  checkDate(e, 'date', date);
  checkNumber(e, 'value', value, { min: 0, max: 100_000, label: 'Значение' });
  assertValid(e);
  const id = `${habitId}|${date}`;
  if (kind === 'value' && value === 0) await db.habitLogs.delete(id);
  else await db.habitLogs.put({ id, habitId, date, value: kind === 'value' ? value : 0, kind });
}

/* ---------- Цели ---------- */

export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'log' | 'status'>;

export function validateGoal(g: GoalInput): Errors {
  const e: Errors = {};
  checkTitle(e, 'title', g.title);
  checkNumber(e, 'target', g.target, { min: 1, max: 10_000_000, label: 'Целевое значение' });
  checkNumber(e, 'initial', g.initial, { min: 0, max: 10_000_000, label: 'Уже выполнено' });
  checkDate(e, 'startDate', g.startDate, 'Дата начала');
  checkDate(e, 'endDate', g.endDate, 'Дата окончания');
  if (!e.startDate && !e.endDate && g.endDate < g.startDate) e.endDate = 'Окончание раньше начала';
  if (!e.target && !e.initial && g.initial > g.target) e.initial = 'Больше целевого значения';
  if (g.source === 'area' && !g.areaId) e.areaId = 'Выберите направление';
  return e;
}

export async function saveGoal(g: GoalInput, id?: string) {
  assertValid(validateGoal(g));
  const clean = { ...g, title: g.title.trim(), areaId: g.source === 'area' ? g.areaId : undefined };
  if (id) {
    const cur = await db.goals.get(id);
    if (!cur) throw new Error('Цель не найдена');
    await db.goals.put({ ...cur, ...clean, id });
    return id;
  }
  const nid = uid();
  await db.goals.add({ ...clean, id: nid, log: [], status: 'active', createdAt: now() });
  return nid;
}

export async function deleteGoal(id: string) {
  await db.transaction('rw', [db.goals, db.tasks], async () => {
    await db.goals.delete(id);
    await db.tasks.where('goalId').equals(id).modify((t) => { delete t.goalId; });
  });
}

export async function addGoalProgress(id: string, date: ISODate, value: number) {
  const e: Errors = {};
  checkNumber(e, 'value', value, { min: -10_000_000, max: 10_000_000, label: 'Значение' });
  if (!e.value && value === 0) e.value = 'Значение не может быть 0';
  assertValid(e);
  const g = await db.goals.get(id);
  if (!g) throw new Error('Цель не найдена');
  await db.goals.update(id, { log: [...g.log, { date, value }] });
}

export const setGoalStatus = (id: string, status: Goal['status']) => db.goals.update(id, { status });

/* ---------- Обзоры ---------- */

export async function saveReview(r: Omit<DailyReview, 'updatedAt'>) {
  const e: Errors = {};
  checkDate(e, 'date', r.date);
  assertValid(e);
  const cut = (s: string) => s.slice(0, 3000);
  await db.reviews.put({
    ...r, achieved: cut(r.achieved), missed: cut(r.missed), obstacles: cut(r.obstacles), improve: cut(r.improve), updatedAt: now(),
  });
}

/* ---------- Таймер концентрации (по временным меткам) ---------- */

export const timerElapsed = (t: TimerState, at = now()) => t.accumulatedMs + (t.runningSince ? at - t.runningSince : 0);

export async function startTimer(p: Pick<TimerState, 'mode' | 'label' | 'taskId' | 'occKey' | 'areaId'>) {
  const existing = await db.timer.get('current');
  if (existing) throw new Error('Уже идёт сеанс. Завершите или сбросьте его.');
  const t = now();
  await db.timer.put({
    id: 'current', ...p, label: p.label.trim() || 'Сосредоточенная работа', phase: 'work',
    sessionStartedAt: t, runningSince: t, accumulatedMs: 0, distractions: [], completedPomodoros: 0,
  });
}

export async function pauseTimer() {
  const t = await db.timer.get('current');
  if (!t || !t.runningSince) return;
  await db.timer.put({ ...t, accumulatedMs: timerElapsed(t), runningSince: null });
}

export async function resumeTimer() {
  const t = await db.timer.get('current');
  if (!t || t.runningSince) return;
  const fresh = t.phase === 'work' && t.accumulatedMs === 0;
  await db.timer.put({ ...t, runningSince: now(), sessionStartedAt: fresh ? now() : t.sessionStartedAt });
}

export async function addDistraction(reason: string) {
  const t = await db.timer.get('current');
  if (!t || !reason.trim()) return;
  await db.timer.put({ ...t, distractions: [...t.distractions, { at: now(), reason: reason.trim().slice(0, 200) }] });
}

async function writeTimerSession(t: TimerState, minutes: number, extra: { amount?: number; note?: string } = {}) {
  const zone = await tz();
  const s: StudySession = {
    id: uid(), date: isoFromMs(t.sessionStartedAt, zone), areaId: t.areaId, taskId: t.taskId, occKey: t.occKey,
    startedAt: t.sessionStartedAt, endedAt: now(), minutes, amount: extra.amount || undefined, source: 'timer',
    distractions: t.distractions.length ? t.distractions : undefined, note: extra.note?.slice(0, 500) || undefined,
  };
  if (s.occKey) {
    const task = s.taskId ? await db.tasks.get(s.taskId) : undefined;
    if (!task) { s.occKey = undefined; s.taskId = undefined; }
  }
  await db.sessions.add(s);
}

/** Завершает сеанс и сохраняет фактическую продолжительность. Возвращает сохранённые минуты. */
export async function finishTimer(extra: { amount?: number; note?: string } = {}, cap?: number): Promise<number> {
  const t = await db.timer.get('current');
  if (!t) return 0;
  let ms = timerElapsed(t);
  if (cap) ms = Math.min(ms, cap);
  const minutes = t.phase === 'work' ? Math.round(ms / 60_000) : 0;
  await db.transaction('rw', [db.timer, db.sessions, db.settings, db.tasks], async () => {
    if (minutes >= 1 || (extra.amount ?? 0) > 0) await writeTimerSession(t, minutes, extra);
    await db.timer.delete('current');
  });
  return minutes;
}

/** Pomodoro: рабочий период окончен — сохранить его и начать отдых. */
export async function pomodoroToBreak(workMs: number) {
  const t = await db.timer.get('current');
  if (!t || t.phase !== 'work') return;
  const at = t.runningSince ? Math.min(now(), t.runningSince + (workMs - t.accumulatedMs)) : now();
  await db.transaction('rw', [db.timer, db.sessions, db.settings, db.tasks], async () => {
    await writeTimerSession(t, Math.round(workMs / 60_000));
    await db.timer.put({
      ...t, phase: 'break', accumulatedMs: 0, runningSince: at, distractions: [], completedPomodoros: t.completedPomodoros + 1,
    });
  });
}

/** Pomodoro: отдых окончен — следующий рабочий период ждёт подтверждения пользователя. */
export async function pomodoroToWork() {
  const t = await db.timer.get('current');
  if (!t || t.phase !== 'break') return;
  await db.timer.put({ ...t, phase: 'work', accumulatedMs: 0, runningSince: null, sessionStartedAt: now() });
}

export async function switchTimerMode(mode: TimerState['mode']) {
  const t = await db.timer.get('current');
  if (t) await db.timer.put({ ...t, mode });
}

export const discardTimer = () => db.timer.delete('current');

/* ---------- Восстановление расписания ---------- */

/** Незавершённые экземпляры за последние `days` дней (ограничено, чтобы не копить бесконечный долг). */
export const RECOVERY_WINDOW_DAYS = 7;
export const recoveryFrom = (today: ISODate) => addDays(today, -RECOVERY_WINDOW_DAYS);

/** Отпустить задачу: пометить пропущенной без переноса. */
export const letGo = (inst: Instance, reason: SkipReason = 'other') => skipInstance(inst, reason, 'Отпущено при восстановлении');

export { occKey, parseTime };
