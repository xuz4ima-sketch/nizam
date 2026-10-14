import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban, CalendarClock, Check, CircleSlash, Clock, Ellipsis, Pencil, Play, Repeat, RotateCcw, Star, Timer, Trash2, Zap,
} from 'lucide-react';
import type { SkipReason } from '../db/schema';
import {
  cancelInstance, completeInstance, deleteInstance, deleteTask, moveInstance, resetInstance, skipInstance, startTimer,
} from '../db/repo';
import { addDays, fmtMinutes, fmtShort, fmtTime, parseTime, showTime } from '../lib/dates';
import { AREA_UNITS, categoryColor, num, SKIP_REASONS, STATUS_LABEL } from '../lib/labels';
import { completion, isOverdue, recurrenceLabel, type Instance } from '../lib/recurrence';
import { findFreeSlot } from '../lib/slots';
import { useData, useInstances } from '../state/data';
import { TaskForm } from './TaskForm';
import { errMsg, Field, Modal, ProgressBar, toNum, useUI } from './ui';

export function TaskItem({ inst, showDate = false, compact = false }: { inst: Instance; showDate?: boolean; compact?: boolean }) {
  const { today, nowMin, areas } = useData();
  const { toast } = useUI();
  const [menu, setMenu] = useState(false);
  const overdue = isOverdue(inst, today, nowMin);
  const done = inst.status === 'done';
  const partial = inst.status === 'partial' || (inst.status === 'planned' && inst.doneMin > 0);
  const inactive = inst.status === 'cancelled' || inst.status === 'skipped';
  const frac = completion(inst);
  const st = parseTime(inst.startTime);
  const color = categoryColor(inst.task.category);
  const area = areas.find((a) => a.id === inst.task.studyAreaId);
  const amountLabel = area && area.unit !== 'min' && inst.doneAmount > 0 ? `${num(inst.doneAmount)} ${AREA_UNITS[area.unit].short}` : '';

  async function toggle() {
    try {
      if (done) { await resetInstance(inst); toast('Отметка снята'); }
      else { await completeInstance(inst); toast('Выполнено — так держать!'); }
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  const meta: React.ReactNode[] = [];
  if (showDate) meta.push(<span key="d">{fmtShort(inst.date)}</span>);
  if (st !== null) meta.push(<span key="dur" className="tabular-nums font-semibold" style={{ color: `color-mix(in srgb, ${color} 80%, var(--text))` }}>{fmtMinutes(inst.durationMin)}</span>);
  if (inst.task.category) meta.push(<span key="c" className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: color }} />{inst.task.category}</span>);
  if (inst.task.recurrence.kind !== 'none') meta.push(<span key="r" className="inline-flex items-center gap-1"><Repeat size={11} />{recurrenceLabel(inst.task)}</span>);
  if (inst.doneMin > 0 && !done) meta.push(<span key="f" className="tabular-nums">факт {fmtMinutes(inst.doneMin)}{amountLabel && ` · ${amountLabel}`}</span>);

  return (
    <li className={`group relative flex min-w-0 items-center gap-3 rounded-[14px] px-2.5 py-2.5 transition-colors hover:bg-soft/70 ${overdue ? 'bg-danger-soft/60' : ''}`}>
      <button
        onClick={toggle}
        disabled={inactive}
        aria-label={done ? `Снять отметку: ${inst.title}` : `Отметить выполненной: ${inst.title}`}
        aria-pressed={done}
        className={`relative grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[7px] border-2 transition-colors ${done ? 'border-accent bg-accent text-accent-fg' : partial ? 'border-gold' : 'border-line hover:border-accent'} disabled:opacity-40`}
      >
        {done && <Check size={14} strokeWidth={3.2} className="check-pop" />}
        {!done && partial && <span className="absolute inset-x-0 bottom-0 bg-gold/70" style={{ height: `${Math.max(15, frac * 100)}%` }} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => setMenu(true)} aria-label={`Действия: ${inst.title}`}>
        <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${done || inactive ? 'text-muted line-through decoration-1' : ''}`}>
          <span className="line-clamp-2 break-words leading-snug sm:line-clamp-1">{inst.title}</span>
          {inst.priority === 'high' && !done && <Star size={13} className="shrink-0 fill-gold text-gold" aria-label="Важно" />}
        </p>
        {(meta.length > 0 || overdue || inst.moved || (inst.status !== 'planned' && inst.status !== 'done')) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
            {meta}
            {overdue && <span className="chip !bg-danger-soft !text-danger">Просрочено</span>}
            {inst.status !== 'planned' && inst.status !== 'done' && <span className="chip">{STATUS_LABEL[inst.status]}{inst.skipReason ? `: ${SKIP_REASONS[inst.skipReason].toLowerCase()}` : ''}</span>}
            {inst.moved && <span className="chip"><CalendarClock size={11} />с {fmtShort(inst.origDate)}</span>}
          </div>
        )}
        {!done && frac > 0 && <div className="mt-1.5 max-w-[220px]"><ProgressBar value={frac} size="sm" tone="gold" label="Частичное выполнение" /></div>}
      </button>
      {!compact && st === null && (
        <span className="hidden shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold tabular-nums sm:inline-block"
          style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color: `color-mix(in srgb, ${color} 85%, var(--text))` }}>
          {fmtMinutes(inst.durationMin)}
        </span>
      )}
      {(st !== null || compact) && (
        <span className="shrink-0 rounded-lg bg-soft px-2 py-1 text-[12px] font-semibold tabular-nums text-muted">
          {st !== null ? (compact ? showTime(st) : <><span className="sm:hidden">{showTime(st)}</span><span className="hidden sm:inline">{showTime(st)}–{showTime(st + inst.durationMin)}</span></>) : fmtMinutes(inst.durationMin)}
        </span>
      )}
      {!compact && st === null && <span className="shrink-0 rounded-lg bg-soft px-2 py-1 text-[12px] font-semibold tabular-nums text-muted sm:hidden">{fmtMinutes(inst.durationMin)}</span>}
      <button className="btn btn-ghost btn-icon -mr-1 !min-w-9 !px-1.5 text-muted" onClick={() => setMenu(true)} aria-label={`Меню задачи ${inst.title}`}>
        <Ellipsis size={18} />
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
              <Timer size={16} /> Свободное окно: {showTime(suggestion)}–{showTime(suggestion + inst.durationMin)} — подставить
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
    <button className={`btn btn-ghost min-h-11 justify-start font-medium ${danger ? '!text-danger' : ''}`} onClick={onClick}>
      {icon}<span className="text-left">{children}</span>
    </button>
  );
}
