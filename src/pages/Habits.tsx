import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { HABIT_COLORS, HABIT_ICONS, HabitIcon, habitIconKey } from '../components/habitIcons';
import { Empty, Field, Modal, PageHeader, ProgressBar, Ring, errFields, errMsg, toNum, useUI } from '../components/ui';
import type { Habit, HabitLog, HabitUnit, ISODate } from '../db/schema';
import { deleteHabit, saveHabit, setHabitLog, validateHabit, type HabitInput } from '../db/repo';
import { addDays, dateRange, fmtLong, fmtShort, fmtWeekdayShort, startOfWeek } from '../lib/dates';
import { HABIT_UNITS, num, pct } from '../lib/labels';
import { dayState, habitStats, habitsToday, logsMap, weekCount, type DayState } from '../lib/streaks';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';

const STATE_CLS: Record<DayState, string> = {
  done: 'bg-accent text-accent-fg', partial: 'bg-gold/45', rest: 'bg-info/25', none: 'bg-soft',
};

export default function Habits({ faith = false }: { faith?: boolean }) {
  const { habits } = useData();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const list = habits.filter((h) => !h.archived && (!faith || h.faith));
  return (
    <div className="fade-in">
      {!faith && <PageHeader title="Привычки" subtitle="Серии считаются по реальным отметкам. Дни отдыха и уважительные пропуски серию не прерывают."
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />Привычка</button>} />}
      {faith && (
        <div className="mb-3 flex items-center justify-between"><h2 className="h2">Привычки поклонения</h2>
          <button className="btn btn-sm btn-outline" onClick={() => setEditing('new')}><Plus size={14} />Добавить</button></div>
      )}
      {!list.length ? (
        <Empty icon={<Flame size={28} />} title="Привычек пока нет"
          text="Например: ежедневное чтение, повторение изученного, физическая активность. Цель может быть в минутах, страницах, повторениях или «выполнено / нет»."
          action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />Создать привычку</button>} />
      ) : (
        <div className="grid gap-5">
          {!faith && <TodayChecklist list={list} />}
          <ul className="grid gap-4 md:grid-cols-2">{list.map((h) => <HabitCard key={h.id} h={h} onEdit={() => setEditing(h)} />)}</ul>
        </div>
      )}
      {editing && <HabitForm habit={editing === 'new' ? undefined : editing} faith={faith} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HabitCard({ h, onEdit }: { h: Habit; onEdit: () => void }) {
  const { habitLogs, today, settings } = useData();
  const { toast } = useUI();
  const [day, setDay] = useState<ISODate | null>(null);
  const logs = useMemo(() => logsMap(habitLogs, h.id), [habitLogs, h.id]);
  const s = habitStats(h, logs, today, settings.weekStart);
  const todayLog = logs.get(today);
  const val = todayLog?.kind === 'value' ? todayLog.value : 0;
  const step = h.unit === 'min' ? 5 : 1;
  const unit = HABIT_UNITS[h.unit].short;
  const from = addDays(startOfWeek(today, settings.weekStart), -21);
  const days = dateRange(from, addDays(from, 27));
  const set = async (v: number) => { try { await setHabitLog(h.id, today, Math.max(0, v)); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <li className="card grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <HabitIcon h={h} size={42} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{h.name}</p>
          <p className="text-xs text-muted">
            {h.frequency === 'weekly' ? `${h.timesPerWeek} раз(а) в неделю · на этой неделе: ${weekCount(h, logs, today, settings.weekStart)}` : 'Ежедневно'}
            {h.unit !== 'check' && ` · цель ${num(h.target)} ${unit}`}
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onEdit} aria-label={`Изменить ${h.name}`}><Pencil size={16} /></button>
      </div>
      <div className="flex items-center gap-3">
        {h.unit === 'check' ? (
          <button className={`btn ${val >= 1 ? 'btn-primary' : 'btn-soft'} flex-1`} aria-pressed={val >= 1} onClick={() => set(val >= 1 ? 0 : 1)}>
            <Check size={18} />{val >= 1 ? 'Выполнено сегодня' : 'Отметить сегодня'}
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <button className="btn btn-outline btn-icon" onClick={() => set(val - step)} aria-label="Уменьшить" disabled={val <= 0}><Minus size={16} /></button>
            <button className="min-w-0 flex-1 text-center" onClick={() => setDay(today)} aria-label="Ввести значение">
              <span className="text-lg font-semibold tabular-nums">{num(val)}</span><span className="text-sm text-muted"> / {num(h.target)} {unit}</span>
            </button>
            <button className="btn btn-outline btn-icon" onClick={() => set(val + step)} aria-label="Увеличить"><Plus size={16} /></button>
          </div>
        )}
      </div>
      {h.unit !== 'check' && (
        <div className="flex items-center gap-2">
          <ProgressBar value={val / h.target} size="sm" color={h.color} label={`${h.name} сегодня`} />
          <span className="shrink-0 text-[12px] font-bold tabular-nums text-muted">{pct(Math.min(1, val / h.target))}</span>
        </div>
      )}
      {todayLog && todayLog.kind !== 'value' && <p className="text-xs text-info">Сегодня: {todayLog.kind === 'rest' ? 'день отдыха' : 'уважительный пропуск'}</p>}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-card-2 py-2 text-center ring-1 ring-line">
        <div><p className="text-lg font-extrabold tabular-nums">{s.current}</p><p className="text-[11px] text-muted">серия, {s.unit}</p></div>
        <div><p className="text-lg font-extrabold tabular-nums">{s.best}</p><p className="text-[11px] text-muted">лучшая серия</p></div>
        <div><p className="text-lg font-extrabold tabular-nums">{pct(s.rate)}</p><p className="text-[11px] text-muted">соблюдение, 30 дн.</p></div>
      </div>
      <div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Календарь выполнения: ${h.name}`}>
          {days.slice(0, 7).map((d) => <span key={d} className="text-center text-[10px] text-muted">{fmtWeekdayShort(d)}</span>)}
          {days.map((d) => {
            const st = d < h.startDate || d > today ? null : dayState(h, logs.get(d));
            return (
              <button key={d} disabled={st === null} onClick={() => setDay(d)}
                aria-label={`${fmtShort(d)}: ${st === 'done' ? 'выполнено' : st === 'rest' ? 'отдых' : st === 'partial' ? 'частично' : 'нет отметки'}`}
                className={`aspect-square rounded-md text-[10px] tabular-nums ${st ? STATE_CLS[st] : 'opacity-25 bg-soft'} ${d === today ? 'ring-2 ring-accent' : ''}`}>
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Нажмите на день, чтобы изменить отметку, отметить отдых или уважительный пропуск.</p>
      </div>
      {day && <DayEditor h={h} date={day} log={logs.get(day)} onClose={() => setDay(null)} />}
    </li>
  );
}

function DayEditor({ h, date, log, onClose }: { h: Habit; date: ISODate; log?: HabitLog; onClose: () => void }) {
  const { toast } = useUI();
  const [v, setV] = useState(log?.kind === 'value' ? String(log.value) : '');
  const [err, setErr] = useState('');
  const save = async (value: number, kind: HabitLog['kind']) => {
    try { await setHabitLog(h.id, date, value, kind); onClose(); } catch (e) { setErr(errMsg(e)); toast(errMsg(e), 'error'); }
  };
  return (
    <Modal open onClose={onClose} title={`${h.name} · ${fmtShort(date)}`}>
      <div className="grid gap-3">
        {h.unit === 'check' ? (
          <button className="btn btn-primary" onClick={() => save(1, 'value')}><Check size={18} />Выполнено</button>
        ) : (
          <form className="flex items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const n = toNum(v);
            if (!Number.isFinite(n) || n < 0) return setErr('Введите число 0 или больше');
            save(n, 'value');
          }}>
            <div className="flex-1"><Field label={`Значение (${HABIT_UNITS[h.unit].short}), цель ${h.target}`} error={err} id="hd-v">
              <input id="hd-v" className="input" type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
            </Field></div>
            <button className="btn btn-primary">Сохранить</button>
          </form>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-outline" onClick={() => save(0, 'rest')}>День отдыха</button>
          <button className="btn btn-outline" onClick={() => save(0, 'excused')}>Уважительный пропуск</button>
        </div>
        <button className="btn btn-ghost" onClick={() => save(0, 'value')}>Очистить отметку</button>
      </div>
    </Modal>
  );
}

function HabitForm({ habit, faith, onClose }: { habit?: Habit; faith: boolean; onClose: () => void }) {
  const { today } = useData();
  const { toast, confirm } = useUI();
  const [d, setD] = useState({
    name: habit?.name ?? '', unit: (habit?.unit ?? 'check') as HabitUnit, target: String(habit?.target ?? 1),
    frequency: habit?.frequency ?? 'daily', times: String(habit?.timesPerWeek ?? 3), startDate: habit?.startDate ?? today, faith: habit?.faith ?? faith,
    icon: habit?.icon ?? '', color: habit?.color ?? HABIT_COLORS[0],
  });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => { if (d.unit === 'check') setD((p) => ({ ...p, target: '1' })); }, [d.unit]);
  const set = (k: keyof typeof d, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: HabitInput = {
      name: d.name, unit: d.unit, target: toNum(d.target), frequency: d.frequency as Habit['frequency'],
      timesPerWeek: toNum(d.times), startDate: d.startDate, faith: d.faith,
      icon: d.icon || habitIconKey({ name: d.name, unit: d.unit }), color: d.color,
    };
    if (input.frequency === 'daily') input.timesPerWeek = 7;
    const errs = validateHabit(input);
    if (Object.keys(errs).length) return setErrors(errs);
    try { await saveHabit(input, habit?.id); toast(habit ? 'Привычка обновлена' : 'Привычка создана'); onClose(); }
    catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
  }

  return (
    <Modal open onClose={onClose} title={habit ? 'Изменить привычку' : 'Новая привычка'}>
      <form className="grid gap-3" onSubmit={submit} noValidate>
        <Field label="Название" error={errors.name} id="h-name"><input id="h-name" className="input" value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus maxLength={200} placeholder="Например: Чтение Корана" /></Field>
        <fieldset>
          <legend className="label">Иконка и цвет</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Иконка">
            {Object.entries(HABIT_ICONS).map(([k, v]) => {
              const on = (d.icon || habitIconKey({ name: d.name, unit: d.unit })) === k;
              const Icon = v.icon;
              return (
                <button type="button" key={k} role="radio" aria-checked={on} aria-label={v.label} title={v.label} onClick={() => set('icon', k)}
                  className={`grid size-10 place-items-center rounded-xl border transition-colors ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg'}`}>
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет">
            {HABIT_COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={d.color === c} aria-label={`Цвет ${c}`} onClick={() => set('color', c)}
                className={`size-8 rounded-full ring-offset-2 ring-offset-card transition-shadow ${d.color === c ? 'ring-2 ring-fg' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Единица" id="h-unit">
            <select id="h-unit" className="input" value={d.unit} onChange={(e) => set('unit', e.target.value)}>
              {Object.entries(HABIT_UNITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          {d.unit !== 'check' && <Field label="Цель в день" error={errors.target} id="h-target"><input id="h-target" type="number" min={1} className="input" value={d.target} onChange={(e) => set('target', e.target.value)} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Частота" id="h-freq">
            <select id="h-freq" className="input" value={d.frequency} onChange={(e) => set('frequency', e.target.value)}>
              <option value="daily">Ежедневно</option><option value="weekly">Несколько раз в неделю</option>
            </select>
          </Field>
          {d.frequency === 'weekly' && <Field label="Раз в неделю" error={errors.timesPerWeek} id="h-times"><input id="h-times" type="number" min={1} max={7} className="input" value={d.times} onChange={(e) => set('times', e.target.value)} /></Field>}
        </div>
        <Field label="Дата начала" error={errors.startDate} hint="Серия и соблюдение считаются с этой даты" id="h-start"><input id="h-start" type="date" className="input" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={d.faith} onChange={(e) => set('faith', e.target.checked)} />Показывать в разделе «Поклонение»</label>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {habit ? (
            <button type="button" className="btn btn-ghost !text-danger" onClick={async () => {
              if (await confirm({ title: 'Удалить привычку?', message: 'Вся история отметок будет удалена.', confirmText: 'Удалить', danger: true })) {
                await deleteHabit(habit.id); toast('Привычка удалена'); onClose();
              }
            }}><Trash2 size={16} />Удалить</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary">Сохранить</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Компактный список «Сегодня»: отметка в одно нажатие, частичный прогресс сохраняется. */
function TodayChecklist({ list }: { list: Habit[] }) {
  const { habitLogs, today, settings } = useData();
  const { toast } = useUI();
  const summary = habitsToday(list, habitLogs, today, settings.weekStart);
  return (
    <section className="card !p-0" aria-label="Привычки на сегодня">
      <div className="flex items-center gap-4 px-4 pt-4 sm:px-5">
        <Ring value={summary.total ? summary.done / summary.total : 0} size={52} stroke={6} label="Выполнено привычек сегодня">
          <span className="text-[12px] font-extrabold tabular-nums">{summary.done}/{summary.total}</span>
        </Ring>
        <div className="min-w-0">
          <h2 className="h2">Сегодня</h2>
          <p className="text-[13px] text-muted">{fmtLong(today)}</p>
        </div>
      </div>
      <ul className="grid p-2 sm:p-3">
        {list.map((h) => {
          const log = habitLogs.find((l) => l.id === `${h.id}|${today}`);
          const val = log?.kind === 'value' ? log.value : 0;
          const done = val >= h.target;
          const rest = log && log.kind !== 'value';
          const step = h.unit === 'min' ? 5 : 1;
          const unit = HABIT_UNITS[h.unit].short;
          const set = async (v: number) => { try { await setHabitLog(h.id, today, Math.max(0, v)); } catch (e) { toast(errMsg(e), 'error'); } };
          return (
            <li key={h.id} className="flex min-w-0 items-center gap-3 rounded-[14px] px-2 py-2 hover:bg-soft/70">
              <HabitIcon h={h} size={36} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[14px] font-semibold ${done ? 'text-muted line-through decoration-1' : ''}`}>{h.name}</p>
                <p className="text-[12px] text-muted tabular-nums">
                  {rest ? (log?.kind === 'rest' ? 'день отдыха' : 'уважительный пропуск') : h.unit === 'check' ? (h.frequency === 'weekly' ? `${h.timesPerWeek} раз(а) в неделю` : 'ежедневно') : `${num(val)} / ${num(h.target)} ${unit}`}
                </p>
              </div>
              {h.unit !== 'check' && !done && (
                <button className="btn btn-outline btn-icon !min-h-9 !min-w-9 !p-1.5" onClick={() => set(val + step)} aria-label={`Добавить ${step} ${unit}: ${h.name}`}><Plus size={16} /></button>
              )}
              <button onClick={() => set(done ? 0 : h.target)} aria-pressed={done}
                aria-label={done ? `Снять отметку: ${h.name}` : `Выполнено полностью: ${h.name}`}
                className={`grid size-[26px] shrink-0 place-items-center rounded-[8px] border-2 transition-colors ${done ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:border-accent'}`}>
                {done && <Check size={15} strokeWidth={3} className="check-pop" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
