import { useEffect, useState } from 'react';
import type { Priority, Recurrence, Task } from '../db/schema';
import { editInstance, saveTask, validateTask, type TaskInput } from '../db/repo';
import { CATEGORIES, PRIORITIES } from '../lib/labels';
import { WEEKDAY_NAMES } from '../lib/dates';
import type { Instance } from '../lib/recurrence';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';
import { errFields, errMsg, Field, Modal, Tabs, toNum, useUI } from './ui';

type RecKind = Recurrence['kind'];

export type TaskPreset = Partial<Draft>;

interface Draft {
  title: string; description: string; category: string; date: string; endDate: string; startTime: string;
  duration: string; priority: Priority; recKind: RecKind; days: number[]; every: string;
  studyAreaId: string; goalId: string; minimal: boolean;
}

function fromTask(t: Task | undefined, defaultDate: string): Draft {
  return {
    title: t?.title ?? '', description: t?.description ?? '', category: t?.category ?? 'Учёба',
    date: t?.date ?? defaultDate, endDate: t?.endDate ?? '', startTime: t?.startTime ?? '',
    duration: String(t?.durationMin ?? 30), priority: t?.priority ?? 'medium', recKind: t?.recurrence.kind ?? 'none',
    days: t?.recurrence.kind === 'weekdays' ? t.recurrence.days : [1, 2, 3, 4, 5],
    every: t?.recurrence.kind === 'interval' ? String(t.recurrence.every) : '2',
    studyAreaId: t?.studyAreaId ?? '', goalId: t?.goalId ?? '', minimal: t?.minimal ?? false,
  };
}

function toInput(d: Draft): TaskInput {
  const recurrence: Recurrence =
    d.recKind === 'weekdays' ? { kind: 'weekdays', days: d.days }
      : d.recKind === 'interval' ? { kind: 'interval', every: toNum(d.every) }
        : { kind: d.recKind };
  return {
    title: d.title, description: d.description, category: d.category.trim() || 'Другое', date: d.date,
    endDate: d.endDate || undefined, startTime: d.startTime || undefined, durationMin: toNum(d.duration),
    priority: d.priority, recurrence, studyAreaId: d.studyAreaId || undefined, goalId: d.goalId || undefined, minimal: d.minimal,
  };
}

export function TaskForm({ open, onClose, task, instance, defaultDate, preset }: {
  open: boolean; onClose: () => void; task?: Task; instance?: Instance; defaultDate?: string; preset?: Partial<Draft>;
}) {
  const { today, areas, goals } = useData();
  const { toast } = useUI();
  const editing = instance?.task ?? task;
  const recurring = !!instance && instance.task.recurrence.kind !== 'none';
  const [scope, setScope] = useState<'one' | 'series'>('one');
  const [d, setD] = useState<Draft>(() => fromTask(editing, defaultDate ?? today));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = fromTask(editing, defaultDate ?? today);
    if (instance && recurring) {
      base.title = instance.title; base.description = instance.description;
      base.startTime = instance.startTime ?? ''; base.duration = String(instance.durationMin);
    }
    setD({ ...base, ...preset });
    setScope('one');
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !instance || !recurring) return;
    if (scope === 'series') setD(fromTask(instance.task, today));
    else setD((p) => ({ ...p, title: instance.title, description: instance.description, startTime: instance.startTime ?? '', duration: String(instance.durationMin) }));
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const oneDay = recurring && scope === 'one';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (oneDay && instance) {
        await editInstance(instance, { title: d.title, description: d.description, startTime: d.startTime || undefined, durationMin: toNum(d.duration) });
        toast('Изменения сохранены только для этого дня');
      } else {
        const input = toInput(d);
        const errs = validateTask(input);
        if (Object.keys(errs).length) { setErrors(errs); return; }
        await saveTask(input, editing?.id);
        toast(editing ? 'Задача обновлена' : 'Задача создана');
      }
      onClose();
    } catch (err) {
      setErrors(errFields(err));
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? (recurring ? 'Изменить занятие' : 'Изменить задачу') : 'Новая задача';
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        {recurring && (
          <div className="flex flex-col gap-1">
            <Tabs label="Что изменить" value={scope} onChange={setScope} items={[['one', 'Только этот день'], ['series', 'Всю серию']]} />
            <p className="text-xs text-muted">
              {scope === 'one' ? 'Остальные дни серии не изменятся.' : 'Изменения применятся ко всем дням, кроме отдельно изменённых.'}
            </p>
          </div>
        )}
        <Field label="Название" error={errors.title} id="t-title">
          <input id="t-title" className="input" value={d.title} onChange={(e) => set('title', e.target.value)} autoFocus maxLength={200} placeholder="Например: Перевод 3 страниц" />
        </Field>
        {!oneDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Категория" id="t-cat">
              <input id="t-cat" className="input" list="cats" value={d.category} onChange={(e) => set('category', e.target.value)} maxLength={40} />
              <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Приоритет" id="t-prio">
              <select id="t-prio" className="input" value={d.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {!oneDay && (
            <Field label={d.recKind === 'none' ? 'Дата' : 'Начало серии'} error={errors.date} id="t-date">
              <input id="t-date" type="date" className="input" value={d.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
          )}
          <Field label="Время начала" error={errors.startTime} hint="Необязательно" id="t-time">
            <input id="t-time" type="time" className="input" value={d.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Длительность, мин" error={errors.durationMin} id="t-dur">
            <input id="t-dur" type="number" inputMode="numeric" min={1} max={1440} className="input" value={d.duration} onChange={(e) => set('duration', e.target.value)} />
          </Field>
        </div>
        {!oneDay && (
          <>
            <Field label="Повторение" error={errors.recurrence} id="t-rec">
              <select id="t-rec" className="input" value={d.recKind} onChange={(e) => set('recKind', e.target.value as RecKind)}>
                <option value="none">Не повторять</option>
                <option value="daily">Ежедневно</option>
                <option value="weekdays">По дням недели</option>
                <option value="interval">Каждые N дней</option>
              </select>
            </Field>
            {d.recKind === 'weekdays' && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Дни недели">
                {[1, 2, 3, 4, 5, 6, 0].map((w) => {
                  const on = d.days.includes(w);
                  return (
                    <button type="button" key={w} aria-pressed={on}
                      className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline'} w-11`}
                      onClick={() => set('days', on ? d.days.filter((x) => x !== w) : [...d.days, w])}>
                      {WEEKDAY_NAMES[w]}
                    </button>
                  );
                })}
              </div>
            )}
            {d.recKind === 'interval' && (
              <Field label="Интервал, дней" id="t-every">
                <input id="t-every" type="number" min={1} max={365} className="input" value={d.every} onChange={(e) => set('every', e.target.value)} />
              </Field>
            )}
            {d.recKind !== 'none' && (
              <Field label="Дата окончания серии" error={errors.endDate} hint="Пусто — без окончания" id="t-end">
                <input id="t-end" type="date" className="input" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Учебное направление" hint="Время зачтётся в прогресс направления" id="t-area">
                <select id="t-area" className="input" value={d.studyAreaId} onChange={(e) => set('studyAreaId', e.target.value)}>
                  <option value="">— нет —</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Связанная цель" id="t-goal">
                <select id="t-goal" className="input" value={d.goalId} onChange={(e) => set('goalId', e.target.value)}>
                  <option value="">— нет —</option>
                  {goals.filter((g) => g.status === 'active' || g.id === d.goalId).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={d.minimal} onChange={(e) => set('minimal', e.target.checked)} />
              Входит в «Минимальный день» (самое важное)
            </label>
          </>
        )}
        <Field label="Описание" error={errors.description} id="t-desc">
          <textarea id="t-desc" className="input min-h-20" value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-outline" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
