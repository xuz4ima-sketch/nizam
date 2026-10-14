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

export interface Placed { inst: Instance; start: number; end: number; lane: number; lanes: number }

/** Раскладка занятий дня по дорожкам: пересекающиеся по времени стоят рядом, а не друг на друге. */
export function layoutDay(dayInsts: Instance[]): Placed[] {
  const items = dayInsts
    .filter((i) => isActive(i) && parseTime(i.startTime) !== null)
    .map((i) => { const s = parseTime(i.startTime) as number; return { inst: i, start: s, end: Math.min(24 * 60, s + Math.max(15, i.durationMin)), lane: 0, lanes: 1 }; })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((c) => c.lane + 1)); for (const c of cluster) c.lanes = n; cluster = []; };
  for (const it of items) {
    if (it.start >= clusterEnd) { flush(); clusterEnd = it.end; }
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return items;
}

/** Пары занятий, пересекающихся по времени (пропущенные и отменённые не учитываются). */
export function findOverlaps(dayInsts: Instance[]): [Instance, Instance][] {
  const items = layoutDay(dayInsts.filter((i) => i.status !== 'skipped'));
  const out: [Instance, Instance][] = [];
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length && items[b].start < items[a].end; b++) out.push([items[a].inst, items[b].inst]);
  return out;
}
