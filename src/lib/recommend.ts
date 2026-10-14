// Простые прозрачные правила для рекомендаций (без платного ИИ). Каждое правило объясняет, откуда оно взялось.
import type { SkipReason } from '../db/schema';
import { SKIP_REASONS } from './labels';
import type { DayStat } from './stats';
import { WEEKDAY_NAMES } from './dates';

import { t as T } from '../i18n';
export interface Recommendation { text: string; why: string }

export function weeklyRecommendations(input: {
  days: DayStat[];
  prevDays: DayStat[];
  reasons: [SkipReason, number][];
  postponed: { title: string; total: number }[];
  byWeekday: number[];
}): Recommendation[] {
  const out: Recommendation[] = [];
  const planned = input.days.reduce((a, d) => a + d.planned, 0);
  const done = input.days.reduce((a, d) => a + d.done, 0);
  const plannedMin = input.days.reduce((a, d) => a + d.plannedMin, 0);
  const actual = input.days.reduce((a, d) => a + d.actualMin, 0);
  const prevActual = input.prevDays.reduce((a, d) => a + d.actualMin, 0);

  if (!planned && !actual) {
    return [{ text: T('Запланируйте хотя бы 1–3 задачи на день, чтобы появилась статистика.'), why: T('За неделю нет данных.') }];
  }
  const rate = planned ? done / planned : 0;
  if (planned && rate < 0.5)
    out.push({ text: T('Сократите план на 20–30% и сосредоточьтесь на трёх главных задачах дня.'), why: T('Выполнено {0} из {1} задач ({2}%).', done, planned, Math.round(rate * 100)) });
  else if (planned && rate >= 0.85)
    out.push({ text: T('Можно аккуратно увеличить нагрузку — например, на 10%.'), why: T('Выполнено {0}% задач.', Math.round(rate * 100)) });
  if (plannedMin && actual < plannedMin * 0.6)
    out.push({ text: T('Запланированное время превышает реальные возможности — уменьшите продолжительность занятий.'), why: T('Запланировано {0} мин, фактически {1} мин.', plannedMin, actual) });

  const top = input.reasons[0];
  if (top) {
    const map: Partial<Record<SkipReason, string>> = {
      time: T('Оставляйте свободные окна между занятиями и не планируйте весь день впритык.'),
      tired: T('Ставьте сложные занятия на утро, а в усталые дни включайте «Минимальный день».'),
      phone: T('Используйте режим концентрации и убирайте телефон из поля зрения на время занятия.'),
      hard: T('Разбивайте сложные задачи на части и начинайте с режима «Начни с 5 минут».'),
      unexpected: T('Держите в расписании резервное время на непредвиденные дела.'),
      motivation: T('Связывайте задачи с целями и начинайте с короткого шага в 5 минут.'),
      other: T('Записывайте конкретную причину пропуска — так проще найти решение.'),
    };
    out.push({ text: map[top[0]] ?? '', why: T('Самая частая причина пропусков: «{0}» ({1} раз).', SKIP_REASONS[top[0]], top[1]) });
  }
  const p = input.postponed[0];
  if (p && p.total >= 3)
    out.push({ text: T('Пересмотрите время или объём занятия «{0}».', p.title), why: T('Оно откладывалось или пропускалось {0} раз(а).', p.total) });

  const best = input.byWeekday.indexOf(Math.max(...input.byWeekday));
  if (input.byWeekday[best] > 0)
    out.push({ text: T('Планируйте самые важные дела на {0} — это ваш самый продуктивный день.', WEEKDAY_NAMES[best]), why: T('В этот день сохранено больше всего времени ({0} мин).', input.byWeekday[best]) });

  if (prevActual > 0 && actual < prevActual * 0.8)
    out.push({ text: T('Продуктивное время снизилось — вернитесь к минимальному стабильному ритму.'), why: T('{0} мин против {1} мин на прошлой неделе.', actual, prevActual) });
  return out.filter((r) => r.text);
}
