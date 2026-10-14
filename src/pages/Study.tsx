import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChartColumn, GraduationCap, ListChecks, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Empty, Field, Modal, PageHeader, ProgressBar, errFields, errMsg, toNum, useUI } from '../components/ui';
import type { AreaUnit, StudyArea } from '../db/schema';
import {
  acceptCarry, addManualSession, clearCarry, deleteArea, deleteSession, saveArea, startTimer, validateArea, type AreaInput,
} from '../db/repo';
import { seedDemoPlan } from '../db/seed';
import { addDays, endOfMonth, fmtDate, fmtMinutes, fmtShort, startOfMonth, startOfWeek } from '../lib/dates';
import { AREA_COLORS, AREA_UNITS, num, pct } from '../lib/labels';
import { areaDone, areaProgress, areaValue } from '../lib/progress';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';
import Habits from './Habits';

export default function Study({ faith = false }: { faith?: boolean }) {
  const { areas, today } = useData();
  const { toast } = useUI();
  const [editing, setEditing] = useState<StudyArea | 'new' | null>(null);
  const list = areas.filter((a) => !faith || a.faith);
  return (
    <div className="fade-in grid gap-5">
      <PageHeader
        title={faith ? 'Поклонение и религиозная учёба' : 'Моё обучение'}
        subtitle={faith
          ? 'Добровольный раздел для личного учёта. Приложение не генерирует аяты, хадисы и религиозные постановления — только ваши собственные записи и нормы.'
          : 'Направления с дневной нормой, недельным планом и фактическим прогрессом из записанных занятий.'}
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />Направление</button>}
      />
      {!list.length ? (
        <Empty icon={faith ? <BookOpen size={28} /> : <GraduationCap size={28} />}
          title={faith ? 'Пока ничего не добавлено' : 'Направлений пока нет'}
          text={faith ? 'Например: чтение Корана — 10 страниц в день, заучивание, изучение таджвида. Нормы задаёте только вы.' : 'Создайте направление (например, «Арабская грамматика — 60 минут в день») или установите демонстрационный план.'}
          action={<div className="flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />Создать</button>
            {!faith && <button className="btn btn-outline" onClick={async () => {
              const n = await seedDemoPlan(today); toast(n ? `Добавлено направлений: ${n}` : 'Демо-план уже добавлен');
            }}><ListChecks size={18} />Демо-план</button>}
          </div>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">{list.map((a) => <AreaCard key={a.id} a={a} onEdit={() => setEditing(a)} />)}</ul>
      )}
      {faith && <Habits faith />}
      {editing && <AreaForm area={editing === 'new' ? undefined : editing} faith={faith} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AreaCard({ a, onEdit }: { a: StudyArea; onEdit: () => void }) {
  const { sessions, today, settings, timer } = useData();
  const { toast } = useUI();
  const nav = useNavigate();
  const [logging, setLogging] = useState(false);
  const [details, setDetails] = useState(false);
  const p = areaProgress(a, sessions, today, settings.weekStart, settings.timeZone);
  const u = AREA_UNITS[a.unit].short;
  const cap = Math.round(a.dailyTarget * settings.maxCarryRatio);
  const offer = Math.min(cap, Math.round(p.yesterdayDeficit));

  return (
    <li className="card grid gap-3" style={{ borderTop: `3px solid ${a.color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{a.name}</p>
          {a.description && <p className="line-clamp-2 text-xs text-muted">{a.description}</p>}
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onEdit} aria-label={`Изменить ${a.name}`}><Pencil size={16} /></button>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm">Сегодня: <b className="tabular-nums">{num(p.doneToday)}</b> из {num(p.targetToday)} {u}</span>
          <span className="text-lg font-semibold tabular-nums text-accent">{pct(p.pctToday)}</span>
        </div>
        <ProgressBar value={p.pctToday} label={`${a.name}: прогресс за сегодня`} />
        <p className="mt-1 text-xs text-muted">
          {p.remainingToday > 0 ? `Осталось: ${num(p.remainingToday)} ${u}` : a.dailyTarget > 0 ? 'Дневная норма выполнена ✓' : 'Дневная норма не задана'}
          {p.extraToday > 0 && ` · включая компенсацию +${num(p.extraToday)}`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-soft px-3 py-2"><p className="text-xs text-muted">Неделя</p><p className="tabular-nums">{num(p.weekDone)} / {num(p.weekTarget)} {u}</p></div>
        <div className="rounded-xl bg-soft px-3 py-2"><p className="text-xs text-muted">Всего{a.totalTarget ? ` (${pct(p.totalPct)})` : ''}</p><p className="tabular-nums">{num(p.total)}{a.totalTarget ? ` / ${num(a.totalTarget)}` : ''} {u}</p></div>
      </div>
      {offer > 0 && p.extraToday === 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>Вчера недовыполнено {num(p.yesterdayDeficit)} {u}. Добавить к сегодняшней норме {num(offer)} {u}?</p>
          <p className="text-xs text-muted">Нагрузка сегодня станет {num(a.dailyTarget + offer)} {u} (лимит компенсации: +{Math.round(settings.maxCarryRatio * 100)}%).</p>
          <button className="btn btn-sm btn-primary mt-2" onClick={async () => { await acceptCarry(a.id, today, offer); toast('Компенсация добавлена'); }}>Добавить</button>
        </div>
      )}
      {p.extraToday > 0 && (
        <button className="btn btn-sm btn-ghost justify-start text-muted" onClick={() => clearCarry(a.id, today)}>Убрать компенсацию на сегодня</button>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" onClick={() => setLogging(true)}><Plus size={14} />Записать занятие</button>
        <button className="btn btn-sm btn-outline" onClick={async () => {
          if (timer) { nav('/focus'); return; }
          try { await startTimer({ mode: 'free', label: a.name, areaId: a.id }); nav('/focus'); } catch (e) { toast(errMsg(e), 'error'); }
        }}><Play size={14} />Таймер</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setDetails(true)}><ChartColumn size={14} />История</button>
      </div>
      {logging && <LogDialog a={a} onClose={() => setLogging(false)} />}
      {details && <AreaDetails a={a} onClose={() => setDetails(false)} />}
    </li>
  );
}

function LogDialog({ a, onClose }: { a: StudyArea; onClose: () => void }) {
  const { today } = useData();
  const { toast } = useUI();
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const counted = a.unit !== 'min';
  return (
    <Modal open onClose={onClose} title={`Записать: ${a.name}`}>
      <form className="grid gap-3" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const m = minutes.trim() ? toNum(minutes) : 0;
        const am = counted && amount.trim() ? toNum(amount) : undefined;
        try {
          await addManualSession({ areaId: a.id, date, minutes: m, amount: am, note });
          toast('Занятие записано'); onClose();
        } catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
      }}>
        <Field label="Дата" error={errors.date} id="l-date"><input id="l-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Минуты" error={errors.minutes} id="l-min"><input id="l-min" type="number" min={0} max={1440} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus={!counted} /></Field>
          {counted && <Field label={AREA_UNITS[a.unit].label} error={errors.amount} id="l-amt"><input id="l-amt" type="number" min={0} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>}
        </div>
        <Field label="Заметка" id="l-note"><input id="l-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Например: стр. 41–55" /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary">Сохранить</button></div>
      </form>
    </Modal>
  );
}

function AreaDetails({ a, onClose }: { a: StudyArea; onClose: () => void }) {
  const { sessions, today, settings } = useData();
  const { confirm, toast } = useUI();
  const u = AREA_UNITS[a.unit].short;
  const weeks = useMemo(() => {
    const ws = startOfWeek(today, settings.weekStart);
    return Array.from({ length: 6 }, (_, i) => {
      const from = addDays(ws, -7 * (5 - i)), to = addDays(from, 6);
      return { label: fmtShort(from), v: areaDone(a, sessions, from, to), target: a.weeklyTarget || a.dailyTarget * 7 };
    });
  }, [a, sessions, today, settings.weekStart]);
  const months = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const [y, m] = today.split('-').map(Number);
      const first = new Date(Date.UTC(y, m - 1 - (3 - i), 1)).toISOString().slice(0, 10);
      return { label: fmtDate(first, { month: 'short', year: '2-digit' }), v: areaDone(a, sessions, startOfMonth(first), endOfMonth(first)) };
    });
  }, [a, sessions, today]);
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.v, w.target)));
  const history = sessions.filter((s) => s.areaId === a.id).sort((x, y) => y.date.localeCompare(x.date) || y.startedAt - x.startedAt).slice(0, 40);
  return (
    <Modal open onClose={onClose} title={a.name}>
      <div className="grid gap-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold">По неделям ({u})</h3>
          <ul className="grid gap-1.5">
            {weeks.map((w) => (
              <li key={w.label} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-2 text-xs">
                <span className="text-muted">с {w.label}</span>
                <div className="relative h-3 rounded-full bg-soft">
                  <div className="h-full rounded-full" style={{ width: `${(w.v / max) * 100}%`, background: a.color }} />
                  {w.target > 0 && <div className="absolute inset-y-[-2px] w-0.5 bg-fg/50" style={{ left: `${(w.target / max) * 100}%` }} title="План" />}
                </div>
                <span className="text-right tabular-nums">{num(w.v)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted">Вертикальная черта — недельный план.</p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">По месяцам ({u})</h3>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            {months.map((m) => <div key={m.label} className="rounded-xl bg-soft p-2"><p className="text-xs text-muted">{m.label}</p><p className="tabular-nums font-medium">{num(m.v)}</p></div>)}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">История занятий</h3>
          {!history.length ? <p className="muted">Записей пока нет.</p> : (
            <ul className="grid gap-1">
              {history.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-muted">{fmtShort(s.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{fmtMinutes(s.minutes)}{s.amount ? ` · ${s.amount} ${u}` : ''}{s.note ? ` · ${s.note}` : ''}
                    <span className="text-xs text-muted"> · {s.source === 'timer' ? 'таймер' : s.source === 'task' ? 'задача' : 'вручную'}</span></span>
                  <span className="tabular-nums text-xs text-muted">{num(areaValue(s, a))} {u}</span>
                  {s.source === 'manual' && (
                    <button className="btn btn-ghost btn-sm !text-danger" aria-label="Удалить запись" onClick={async () => {
                      if (await confirm({ title: 'Удалить запись?', confirmText: 'Удалить', danger: true })) { await deleteSession(s.id); toast('Удалено'); }
                    }}><Trash2 size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AreaForm({ area, faith, onClose }: { area?: StudyArea; faith: boolean; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState({
    name: area?.name ?? '', description: area?.description ?? '', unit: (area?.unit ?? 'min') as AreaUnit,
    daily: String(area?.dailyTarget ?? 60), weekly: String(area?.weeklyTarget ?? 0), total: String(area?.totalTarget ?? 0),
    carryOver: area?.carryOver ?? false, faith: area?.faith ?? faith, color: area?.color ?? AREA_COLORS[0],
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof d, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));
  const u = AREA_UNITS[d.unit].short;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: AreaInput = {
      name: d.name, description: d.description.slice(0, 1000), unit: d.unit, dailyTarget: toNum(d.daily),
      weeklyTarget: d.weekly.trim() ? toNum(d.weekly) : 0, totalTarget: d.total.trim() ? toNum(d.total) : 0,
      carryOver: d.carryOver, faith: d.faith, color: d.color,
    };
    const errs = validateArea(input);
    if (Object.keys(errs).length) return setErrors(errs);
    try { await saveArea(input, area?.id); toast(area ? 'Направление обновлено' : 'Направление создано'); onClose(); }
    catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
  }

  return (
    <Modal open onClose={onClose} title={area ? 'Изменить направление' : 'Новое направление'}>
      <form className="grid gap-3" onSubmit={submit} noValidate>
        <Field label="Название" error={errors.name} id="a-name"><input id="a-name" className="input" value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus maxLength={200} placeholder="Например: Арабская грамматика" /></Field>
        <Field label="Описание и общая цель" id="a-desc"><textarea id="a-desc" className="input min-h-16" value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Учитывать в" id="a-unit">
            <select id="a-unit" className="input" value={d.unit} onChange={(e) => set('unit', e.target.value)}>
              {Object.entries(AREA_UNITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label={`Дневная норма, ${u}`} error={errors.dailyTarget} id="a-daily"><input id="a-daily" type="number" min={0} className="input" value={d.daily} onChange={(e) => set('daily', e.target.value)} /></Field>
          <Field label={`Недельный план, ${u}`} error={errors.weeklyTarget} hint="0 — норма × 7" id="a-weekly"><input id="a-weekly" type="number" min={0} className="input" value={d.weekly} onChange={(e) => set('weekly', e.target.value)} /></Field>
          <Field label={`Общая цель, ${u}`} error={errors.totalTarget} hint="0 — без общей цели" id="a-total"><input id="a-total" type="number" min={0} className="input" value={d.total} onChange={(e) => set('total', e.target.value)} /></Field>
        </div>
        <fieldset>
          <legend className="label">Цвет</legend>
          <div className="flex flex-wrap gap-2">
            {AREA_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => set('color', c)} aria-label={`Цвет ${c}`} aria-pressed={d.color === c}
                className={`size-8 rounded-full ${d.color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-fg' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={d.carryOver} onChange={(e) => set('carryOver', e.target.checked)} />
          <span>Предлагать компенсацию: если норма не выполнена, предложить добавить остаток к следующему дню (только с вашего подтверждения).</span>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={d.faith} onChange={(e) => set('faith', e.target.checked)} />Показывать в разделе «Поклонение»</label>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {area ? (
            <button type="button" className="btn btn-ghost !text-danger" onClick={async () => {
              if (await confirm({ title: 'Удалить направление?', message: 'Записанные занятия останутся в общей статистике времени, но перестанут относиться к направлению. Задачи будут отвязаны.', confirmText: 'Удалить', danger: true })) {
                await deleteArea(area.id); toast('Направление удалено'); onClose();
              }
            }}><Trash2 size={16} />Удалить</button>
          ) : <span />}
          <div className="flex gap-2"><button type="button" className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary">Сохранить</button></div>
        </div>
      </form>
    </Modal>
  );
}
