import { parseTime } from './dates';
import { isActive, type Instance } from './recurrence';

/** Первое свободное окно нужной длины в рабочем дне (минуты от полуночи) или null. */
export function findFreeSlot(dayInsts: Instance[], durationMin: number, dayStart: string, dayEnd: string, notBefore = 0): number | null {
  const ds = parseTime(dayStart) ?? 7 * 60;
  const de = parseTime(dayEnd) ?? 23 * 60;
  const busy = dayInsts
    .filter((i) => isActive(i) && i.status !== 'skipped' && parseTime(i.startTime) !== null)
    .map((i) => [parseTime(i.startTime) as number, (parseTime(i.startTime) as number) + i.durationMin] as const)
    .sort((a, b) => a[0] - b[0]);
  let cur = Math.max(ds, Math.ceil(notBefore / 5) * 5);
  for (const [s, e] of busy) {
    if (s - cur >= durationMin) break;
    cur = Math.max(cur, e);
  }
  return cur + durationMin <= de ? cur : null;
}
