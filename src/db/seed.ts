// Демонстрационный учебный план из ТЗ. Это редактируемый пример, а не обязательные нормы:
// создаются направления и ежедневные задачи БЕЗ жёсткого времени — пользователь распределяет их сам.
import { db } from './db';
import type { AreaUnit, ISODate, StudyArea, Task } from './schema';
import { AREA_COLORS, uid } from '../lib/labels';

import { t as T } from '../i18n';
interface DemoItem { name: string; unit: AreaUnit; daily: number; duration: number; category: string; faith?: boolean; minimal?: boolean }

export const DEMO_PLAN: DemoItem[] = [
  { name: 'Чтение Корана', unit: 'pages', daily: 30, duration: 45, category: 'Поклонение', faith: true, minimal: true },
  { name: 'Перевод арабской книги', unit: 'min', daily: 120, duration: 120, category: 'Учёба', minimal: true },
  { name: 'Изучение арабского языка', unit: 'min', daily: 60, duration: 60, category: 'Языки', minimal: true },
  { name: 'Чтение книги', unit: 'min', daily: 30, duration: 30, category: 'Чтение' },
  { name: 'Изучение русского языка', unit: 'min', daily: 20, duration: 20, category: 'Языки' },
  { name: 'Программирование', unit: 'min', daily: 45, duration: 45, category: 'Программирование' },
  { name: 'Физическая активность', unit: 'min', daily: 20, duration: 20, category: 'Спорт' },
];

/** Возвращает количество созданных направлений (существующие с тем же названием пропускаются). */
export async function seedDemoPlan(today: ISODate): Promise<number> {
  let created = 0;
  await db.transaction('rw', [db.areas, db.tasks], async () => {
    const existing = new Set((await db.areas.toArray()).map((a) => a.name.toLowerCase()));
    const name = (d: DemoItem) => T(d.name);
    const t = Date.now();
    for (const [i, d] of DEMO_PLAN.entries()) {
      if (existing.has(name(d).toLowerCase())) continue;
      const area: StudyArea = {
        id: uid(), name: name(d), description: T('Пример из демонстрационного плана — измените или удалите.'),
        unit: d.unit, dailyTarget: d.daily, weeklyTarget: 0, totalTarget: 0, faith: !!d.faith,
        carryOver: false, extra: {}, color: AREA_COLORS[i % AREA_COLORS.length], createdAt: t + i,
      };
      const task: Task = {
        id: uid(), title: name(d), description: '', category: T(d.category), date: today, durationMin: d.duration,
        priority: d.minimal ? 'high' : 'medium', recurrence: { kind: 'daily' }, studyAreaId: area.id,
        minimal: !!d.minimal, createdAt: t, updatedAt: t,
      };
      await db.areas.add(area);
      await db.tasks.add(task);
      created++;
    }
  });
  return created;
}
