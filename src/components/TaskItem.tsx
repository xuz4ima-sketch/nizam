import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban, CalendarClock, Check, CircleSlash, Clock, EllipsisVertical, Pencil, Play, Repeat, RotateCcw, Timer, Trash2, Zap,
} from 'lucide-react';
import type { SkipReason } from '../db/schema';
import {
  cancelInstance, completeInstance, deleteInstance, deleteTask, moveInstance, resetInstance, skipInstance, startTimer,
} from '../db/repo';
import { addDays, fmtMinutes, fmtShort, fmtTime, parseTime } from '../lib/dates';
import { AREA_UNITS, SKIP_REASONS, STATUS_LABEL } from '../lib/labels';
import { completion, isOverdue, recurrenceLabel, type Instance } from '../lib/recurrence';
import { findFreeSlot } from '../lib/slots';
import { useData, useInstances } from '../state/data';
import { TaskForm } from './TaskForm';
import { errMsg, Field, Modal, ProgressBar, toNum, useUI } from './ui';

export function TaskItem({ inst, showDate = false }: { inst: Instance; showDate?: boolean }) {
  const { today, nowMin } = useData();
  const { toast } = useUI();
  const [menu, setMenu] = useState(false);
  const overdue = isOverdue(inst, today, nowMin);
  const done = inst.status === 'done';
  const inactive = inst.status === 'cancelled' || inst.status === 'skipped';
  const frac = completion(inst);
  const st = parseTime(inst.startTime);

  async function toggle() {
    try {
      if (done) { await resetInstance(inst); toast('Отметка снята'); }
      else { await completeInstance(inst); toast('Выполнено ✓'); }
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <li className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${overdue ? 'border-danger/40 bg-danger/5' : 'border-line bg-card'}`}>
      <button
        onClick={toggle}
        disabled={inactive}
        aria-label={done ? `Снять отметку: ${inst.title}` : `Отметить выполненной: ${inst.title}`}
        aria-pressed={done}
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? 'border-ok bg-ok text-white' : 'border-line hover:border-accent'} disabled:opacity-40`}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => setMenu(true)} aria-label={`Действия: ${inst.title}`}>
        <p className={`truncate font-medium ${done || inactive ? 'text-muted line-through decoration-1' : ''}`}>{inst.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {showDate && <span>{fmtShort(inst.date)}</span>}
          {st !== null ? <span className="tabular-nums">{fmtTime(st)}–{fmtTime(st + inst.durationMin)}</span> : <span>{fmtMinutes(inst.durationMin)}</span>}
          {inst.task.category && <span className="chip">{inst.task.category}</span>}
          {inst.task.recurrence.kind !== 'none' && <span className="chip"><Repeat size={11} />{recurrenceLabel(inst.task)}</span>}
          {inst.priority === 'high' && <span className="chip !bg-amber-500/15 !text-amber-700 dark:!text-amber-300">Важно</span>}
          {overdue && <span className="chip !bg-danger/15 !text-danger">Просрочено</span>}
          {inst.status !== 'planned' && inst.status !== 'done' && <span className="chip">{STATUS_LABEL[inst.status]}{inst.skipReason ? `: ${SKIP_REASONS[inst.skipReason].toLowerCase()}` : ''}</span>}
          {inst.moved && <span className="chip"><CalendarClock size={11} />перенесено с {fmtShort(inst.origDate)}</span>}
          {inst.doneMin > 0 && <span className="tabular-nums">· факт {fmtMinutes(inst.doneMin)}</span>}
        </div>
        {!done && frac > 0 && <div className="mt-2"><ProgressBar value={frac} size="sm" label="Частичное выполнение" /></div>}
      </button>
      <button className="btn btn-ghost btn-icon -mr-1" onClick={() => setMenu(true)} aria-label={`Меню задачи ${inst.title}`}>
        <EllipsisVertical size={18} />
      </button>
      {menu && <InstanceActions inst={inst} onClose={() => setMenu(false)} />}
    </li>
  );
}

type Mode = 'menu' | 'progress' | 'skip' | 'move' | 'edit';

export function InstanceActions({ inst, onClose, initial = 'menu' }: { inst: Instance; onClose: () => void; initial?: Mode }) {
  const { settings, today, nowMin, areas, timer } = useData();
  const { toast, confirm } = useUI();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>(initial);
  const area = areas.find((a) => a.id === inst.task.studyAreaId);
  const unit = area && area.unit !== 'min' ? AREA_UNITS[area.unit] : null;
  const [minutes, setMinutes] = useState(String(inst.doneMin || ''));
  const [amount, setAmount] = useState(inst.doneAmount ? String(inst.doneAmount) : '');
  const [reason, setReason] = useState<SkipReason>('time');
  const [note, setNote] = useState('');
  const [moveDate, setMoveDate] = useState(inst.date < today ? today : inst.date);
  const [moveTime, setMoveTime] = useState(inst.startTime ?? '');
  const [err, setErr] = useState('');
  const targetDay = useInstances(moveDate, moveDate);
  const recurring = inst.task.recurrence.kind !== 'none';

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); onClose(); } catch (e) { setErr(errMsg(e)); }
  };

  const suggestion = (() => {
    const others = targetDay.filter((i) => i.key !== inst.key);
    return findFreeSlot(others, inst.durationMin, settings.dayStart, settings.dayEnd, moveDate === today ? nowMin : 0);
  })();

  async function focus(mode: 'free' | 'five') {
    if (timer) { toast('Уже идёт сеанс концентрации', 'error'); nav('/focus'); onClose(); return; }
    try {
      await startTimer({ mode, label: inst.title, taskId: inst.task.id, occKey: inst.key, areaId: inst.task.studyAreaId });
      onClose();
      nav('/focus');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  if (mode === 'edit') return <TaskForm open onClose={onClose} instance={inst} />;

  const titles: Record<Mode, string> = { menu: inst.title, progress: 'Фактическое выполнение', skip: 'Пропуск', move: 'Перенос', edit: '' };

  return (
    <Modal open onClose={onClose} title={titles[mode]}>
      {err && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{err}</p>}
      {mode === 'menu' && (
        <div className="grid gap-1">
          <p className="mb-2 text-sm text-muted">
            {fmtShort(inst.date)} · план {fmtMinutes(inst.durationMin)}{inst.doneMin > 0 && ` · факт ${fmtMinutes(inst.doneMin)}`} · {STATUS_LABEL[inst.status]}
          </p>
          {inst.description && <p className="mb-2 whitespace-pre-wrap text-sm">{inst.description}</p>}
          {inst.status !== 'done' && <MenuBtn icon={<Check size={18} />} onClick={() => run(() => completeInstance(inst), 'Выполнено ✓')}>Выполнено</MenuBtn>}
          <MenuBtn icon={<Clock size={18} />} onClick={() => setMode('progress')}>Указать фактическое время / частично</MenuBtn>
          {inst.status !== 'done' && <MenuBtn icon={<Play size={18} />} onClick={() => focus('free')}>Начать в режиме концентрации</MenuBtn>}
          {inst.status !== 'done' && <MenuBtn icon={<Zap size={18} />} onClick={() => focus('five')}>Начни с 5 минут</MenuBtn>}
          <MenuBtn icon={<CalendarClock size={18} />} onClick={() => setMode('move')}>Перенести</MenuBtn>
          {inst.status !== 'skipped' && <MenuBtn icon={<CircleSlash size={18} />} onClick={() => setMode('skip')}>Пропустить (указать причину)</MenuBtn>}
          {inst.status !== 'cancelled' && <MenuBtn icon={<Ban size={18} />} onClick={() => run(() => cancelInstance(inst), 'Задача отменена')}>Отменить</MenuBtn>}
          {inst.status !== 'planned' && <MenuBtn icon={<RotateCcw size={18} />} onClick={() => run(() => resetInstance(inst), 'Возвращено в план')}>Вернуть в «Запланировано»</MenuBtn>}
          <MenuBtn icon={<Pencil size={18} />} onClick={() => setMode('edit')}>Редактировать</MenuBtn>
          <MenuBtn danger icon={<Trash2 size={18} />} onClick={async () => {
            const ok = await confirm({
              title: recurring ? 'Удалить этот день?' : 'Удалить задачу?',
              message: 'Учтённое по ней время тоже будет удалено, показатели пересчитаются.', confirmText: 'Удалить', danger: true,
            });
            if (ok) run(() => deleteInstance(inst), 'Удалено');
          }}>{recurring ? 'Удалить только этот день' : 'Удалить'}</MenuBtn>
          {recurring && (
            <MenuBtn danger icon={<Trash2 size={18} />} onClick={async () => {
              const ok = await confirm({
                title: 'Удалить всю серию?', message: `«${inst.task.title}» исчезнет из всех дней вместе с историей выполнения.`,
                confirmText: 'Удалить серию', danger: true,
              });
              if (ok) run(() => deleteTask(inst.task.id), 'Серия удалена');
            }}>Удалить всю серию</MenuBtn>
          )}
        </div>
      )}

      {mode === 'progress' && (
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          const m = toNum(minutes);
          const a = unit ? (amount.trim() ? toNum(amount) : undefined) : undefined;
          if (!Number.isFinite(m) || m < 0) return setErr('Введите количество минут (0 или больше)');
          if (a !== undefined && (!Number.isFinite(a) || a < 0)) return setErr('Объём должен быть числом не меньше 0');
          run(() => completeInstance(inst, { totalMin: m, amount: a, status: m >= inst.durationMin ? 'done' : 'partial' }),
            m >= inst.durationMin ? 'Выполнено ✓' : 'Частичное выполнение сохранено');
        }}>
          <p className="text-sm text-muted">План: {fmtMinutes(inst.durationMin)}. Укажите общее фактическое время. Время из таймера уже учтено и не будет добавлено повторно.</p>
          <Field label="Всего минут" id="p-min">
            <input id="p-min" className="input" type="number" min={0} max={1440} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus />
          </Field>
          {unit && (
            <Field label={`Выполненный объём (${unit.label.toLowerCase()})`} id="p-amt">
              <input id="p-amt" className="input" type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          {Number.isFinite(toNum(minutes)) && (
            <ProgressBar value={toNum(minutes) / inst.durationMin} label="Доля выполнения" />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setMode('menu')}>Назад</button>
            <button className="btn btn-primary">Сохранить</button>
          </div>
        </form>
      )}

      {mode === 'skip' && (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => skipInstance(inst, reason, note), 'Пропуск отмечен'); }}>
          <fieldset className="grid gap-1.5">
            <legend className="label">Что помешало?</legend>
            {(Object.keys(SKIP_REASONS) as SkipReason[]).map((r) => (
              <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${reason === r ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--accent)]" />
                {SKIP_REASONS[r]}
              </label>
            ))}
          </fieldset>
          <Field label="Комментарий" id="s-note">
            <input id="s-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setMode('menu')}>Назад</button>
            <button className="btn btn-primary">Отметить пропуск</button>
          </div>
        </form>
      )}

      {mode === 'move' && (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => moveInstance(inst, moveDate, moveTime || undefined), 'Перенесено'); }}>
          {recurring && <p className="text-sm text-muted">Переносится только этот день — остальная серия не меняется.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setMoveDate(today)}>Сегодня</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setMoveDate(addDays(today, 1))}>Завтра</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setMoveDate(addDays(today, 2))}>Послезавтра</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата" id="m-date"><input id="m-date" type="date" className="input" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></Field>
            <Field label="Время" id="m-time"><input id="m-time" type="time" className="input" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} /></Field>
          </div>
          {suggestion !== null ? (
            <button type="button" className="btn btn-outline justify-start" onClick={() => setMoveTime(fmtTime(suggestion))}>
              <Timer size={16} /> Свободное окно: {fmtTime(suggestion)}–{fmtTime(suggestion + inst.durationMin)} — подставить
            </button>
          ) : <p className="text-sm text-muted">В этот день нет свободного окна на {fmtMinutes(inst.durationMin)} в пределах рабочего дня.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setMode('menu')}>Назад</button>
            <button className="btn btn-primary">Перенести</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MenuBtn({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`btn btn-ghost justify-start ${danger ? '!text-danger' : ''}`} onClick={onClick}>
      {icon}<span className="text-left">{children}</span>
    </button>
  );
}
