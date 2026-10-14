// Резервное копирование: экспорт всех таблиц в JSON и импорт с проверкой структуры.
import { db, TABLES, type TableName } from './db';
import { SCHEMA_VERSION } from './schema';
import { isValidISO } from '../lib/dates';

export interface BackupFile {
  app: 'nizam';
  schemaVersion: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function exportAll(): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  return { app: 'nizam', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Минимальные обязательные поля каждой записи. */
const RULES: Record<TableName, (r: Record<string, unknown>) => boolean> = {
  tasks: (r) => str(r.id) && str(r.title) && isValidISO(r.date) && fin(r.durationMin) && isObj(r.recurrence),
  occurrences: (r) => str(r.id) && str(r.taskId) && isValidISO(r.date) && str(r.status),
  sessions: (r) => str(r.id) && isValidISO(r.date) && fin(r.minutes) && (r.minutes as number) >= 0,
  areas: (r) => str(r.id) && str(r.name) && fin(r.dailyTarget),
  habits: (r) => str(r.id) && str(r.name) && fin(r.target),
  habitLogs: (r) => str(r.id) && str(r.habitId) && isValidISO(r.date) && fin(r.value),
  goals: (r) => str(r.id) && str(r.title) && fin(r.target) && Array.isArray(r.log),
  reviews: (r) => isValidISO(r.date),
  settings: (r) => r.id === 'main',
  timer: (r) => r.id === 'current',
  prefs: (r) => str(r.id),
  memo: (r) => str(r.id) && str(r.textId) && fin(r.idx),
};

export function validateBackup(raw: unknown): { ok: true; file: BackupFile; counts: Record<string, number> } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: 'Файл не является объектом JSON' };
  if (raw.app !== 'nizam') return { ok: false, error: 'Это не резервная копия НИЗАМ' };
  if (!fin(raw.schemaVersion) || (raw.schemaVersion as number) > SCHEMA_VERSION)
    return { ok: false, error: 'Неподдерживаемая версия резервной копии' };
  if (!isObj(raw.data)) return { ok: false, error: 'Нет раздела data' };
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = raw.data[t] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: `Раздел «${t}» должен быть массивом` };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!isObj(r) || !RULES[t](r)) return { ok: false, error: `Ошибка в разделе «${t}», запись №${i + 1}` };
    }
    counts[t] = rows.length;
  }
  return { ok: true, file: raw as unknown as BackupFile, counts };
}

/** Полностью заменяет данные содержимым резервной копии (атомарно). */
export async function importAll(raw: unknown) {
  const v = validateBackup(raw);
  if (!v.ok) throw new Error(v.error);
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = v.file.data[t] ?? [];
      if (rows.length) await db.table(t).bulkPut(rows);
    }
  });
  return v.counts;
}

export async function clearAll(keepSettings = true) {
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.media], async () => {
    for (const t of TABLES) if (!(keepSettings && t === 'settings')) await db.table(t).clear();
    await db.media.clear();
  });
}

export function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
