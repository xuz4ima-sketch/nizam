// Простые прозрачные правила для рекомендаций (без платного ИИ). Каждое правило объясняет, откуда оно взялось.
import type { SkipReason } from '../db/schema';
import { SKIP_REASONS } from './labels';
import type { DayStat } from './stats';
import { WEEKDAY_NAMES } from './dates';

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
    return [{ text: 'Запланируйте хотя бы 1–3 задачи на день, чтобы появилась статистика.', why: 'За неделю нет данных.' }];
  }
  const rate = planned ? done / planned : 0;
  if (planned && rate < 0.5)
    out.push({ text: 'Сократите план на 20–30% и сосредоточьтесь на трёх главных задачах дня.', why: `Выполнено ${done} из ${planned} задач (${Math.round(rate * 100)}%).` });
  else if (planned && rate >= 0.85)
    out.push({ text: 'Можно аккуратно увеличить нагрузку — например, на 10%.', why: `Выполнено ${Math.round(rate * 100)}% задач.` });
  if (plannedMin && actual < plannedMin * 0.6)
    out.push({ text: 'Запланированное время превышает реальные возможности — уменьшите продолжительность занятий.', why: `Запланировано ${plannedMin} мин, фактически ${actual} мин.` });

  const top = input.reasons[0];
  if (top) {
    const map: Partial<Record<SkipReason, string>> = {
      time: 'Оставляйте свободные окна между занятиями и не планируйте весь день впритык.',
      tired: 'Ставьте сложные занятия на утро, а в усталые дни включайте «Минимальный день».',
      phone: 'Используйте режим концентрации и убирайте телефон из поля зрения на время занятия.',
      hard: 'Разбивайте сложные задачи на части и начинайте с режима «Начни с 5 минут».',
      unexpected: 'Держите в расписании резервное время на непредвиденные дела.',
      motivation: 'Связывайте задачи с целями и начинайте с короткого шага в 5 минут.',
      other: 'Записывайте конкретную причину пропуска — так проще найти решение.',
    };
    out.push({ text: map[top[0]] ?? '', why: `Самая частая причина пропусков: «${SKIP_REASONS[top[0]]}» (${top[1]} раз).` });
  }
  const p = input.postponed[0];
  if (p && p.total >= 3)
    out.push({ text: `Пересмотрите время или объём занятия «${p.title}».`, why: `Оно откладывалось или пропускалось ${p.total} раз(а).` });

  const best = input.byWeekday.indexOf(Math.max(...input.byWeekday));
  if (input.byWeekday[best] > 0)
    out.push({ text: `Планируйте самые важные дела на ${WEEKDAY_NAMES[best]} — это ваш самый продуктивный день.`, why: `В этот день сохранено больше всего времени (${input.byWeekday[best]} мин).` });

  if (prevActual > 0 && actual < prevActual * 0.8)
    out.push({ text: 'Продуктивное время снизилось — вернитесь к минимальному стабильному ритму.', why: `${actual} мин против ${prevActual} мин на прошлой неделе.` });
  return out.filter((r) => r.text);
}
