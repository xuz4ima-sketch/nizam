// Внутренние уведомления приложения — вычисляются из сохранённых данных, ничего не выдумывается.
import type { AppData } from '../state/data';
import type { Instance } from './recurrence';
import { isOverdue } from './recurrence';
import { fmtMinutes, parseTime, showTime } from './dates';
import { goalDone, goalProgress } from './progress';
import { dayState, logsMap } from './streaks';

import { t as T } from '../i18n';
export interface Notice {
  id: string;
  tone: 'accent' | 'warn' | 'danger' | 'gold' | 'info';
  title: string;
  text: string;
  to: string;
}

export function buildNotices(d: AppData, todayInsts: Instance[]): Notice[] {
  const out: Notice[] = [];
  const { today, nowMin, settings, timer } = d;

  if (timer) {
    out.push({
      id: 'timer', tone: 'accent', to: '/focus',
      title: timer.runningSince ? T('Идёт сеанс концентрации') : T('Сеанс на паузе'),
      text: timer.label,
    });
  }

  const upcoming = todayInsts
    .filter((i) => i.status === 'planned' && parseTime(i.startTime) !== null)
    .map((i) => ({ i, st: parseTime(i.startTime) as number }))
    .filter(({ st }) => st >= nowMin && st - nowMin <= 60)
    .sort((a, b) => a.st - b.st)[0];
  if (upcoming) {
    const left = upcoming.st - nowMin;
    out.push({
      id: `soon|${upcoming.i.key}`, tone: 'gold', to: '/tasks',
      title: left === 0 ? T('Занятие начинается сейчас') : T('Через {0}', fmtMinutes(left)),
      text: `${upcoming.i.title} · ${showTime(upcoming.st)}`,
    });
  }

  const overdue = todayInsts.filter((i) => isOverdue(i, today, nowMin));
  if (overdue.length) {
    out.push({
      id: 'overdue', tone: 'danger', to: '/tasks',
      title: T('Просрочено задач: {0}', overdue.length),
      text: T('Отметьте выполнение, перенесите или укажите причину пропуска.'),
    });
  }

  if (nowMin >= 18 * 60) {
    const daily = d.habits.filter((h) => !h.archived && h.frequency === 'daily' && h.startDate <= today);
    const left = daily.filter((h) => dayState(h, logsMap(d.habitLogs, h.id).get(today)) === 'none' || dayState(h, logsMap(d.habitLogs, h.id).get(today)) === 'partial');
    if (left.length) out.push({ id: 'habits', tone: 'info', to: '/habits', title: T('Привычки на сегодня: осталось {0}', left.length), text: left.slice(0, 3).map((h) => h.name).join(', ') });
  }

  for (const g of d.goals) {
    if (g.status !== 'active') continue;
    const p = goalProgress(g, goalDone(g, d), today);
    if (p.state === 'behind') out.push({ id: `goal|${g.id}`, tone: 'warn', to: '/goals', title: T('Цель отстаёт от плана'), text: T('{0}: нужно ≈ {1} {2} в день', g.title, Math.ceil(p.pace), g.unit) });
  }

  const hasData = d.tasks.length + d.areas.length + d.habits.length > 0;
  if (hasData && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 7 * 864e5)) {
    out.push({
      id: 'backup', tone: 'info', to: '/settings',
      title: T('Сохраните резервную копию'),
      text: settings.lastBackupAt ? T('Последней копии больше недели.') : T('Копия ещё не создавалась — данные хранятся только в этом браузере.'),
    });
  }
  return out;
}
