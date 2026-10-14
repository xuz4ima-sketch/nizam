import { useState } from 'react';
import { Archive, BookOpen, Check, Pencil, Plus, RotateCcw, Target, Trash2 } from 'lucide-react';
import { Empty, Field, Modal, PageHeader, ProgressBar, Tabs, errFields, errMsg, toNum, useUI } from '../components/ui';
import type { Goal, GoalType } from '../db/schema';
import { addGoalProgress, deleteGoal, saveGoal, setGoalStatus, validateGoal, type GoalInput } from '../db/repo';
import { addDays, fmtShort } from '../lib/dates';
import { AREA_UNITS, GOAL_TYPES, num, pct } from '../lib/labels';
import { goalDone, goalProgress, type GoalProgress } from '../lib/progress';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';

import { t as T } from '../i18n';
const STATE: Record<GoalProgress['state'], [string, string]> = {
  done: ['Достигнута', 'bg-ok/15 text-ok'],
  ontrack: ['По графику', 'bg-accent-soft text-accent'],
  behind: ['Отставание', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
  overdue: ['Срок прошёл', 'bg-danger/15 text-danger'],
  upcoming: ['Ещё не началась', 'bg-soft text-muted'],
};

export default function Goals() {
  const { goals } = useData();
  const [tab, setTab] = useState<Goal['status']>('active');
  const [editing, setEditing] = useState<Goal | 'new' | 'book' | null>(null);
  const list = goals.filter((g) => g.status === tab);
  return (
    <div className="fade-in">
      <PageHeader title={T('Цели')} subtitle={T('Остаток и необходимый темп рассчитываются из реальных данных.')}
        actions={<>
          <button className="btn btn-outline" onClick={() => setEditing('book')}><BookOpen size={18} />{T('Прочитать книгу')}</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />{T('Цель')}</button>
        </>} />
      <div className="mb-4"><Tabs label={T('Статус')} value={tab} onChange={setTab} items={[['active', T('Активные')], ['done', T('Достигнутые')], ['archived', T('Архив')]]} /></div>
      {!list.length ? (
        <Empty icon={<Target size={28} />} title={tab === 'active' ? T('Активных целей нет') : T('Здесь пока пусто')}
          text={T('Например: «Прочитать книгу за 5 дней» — укажите количество страниц, сроки и уже прочитанное.')}
          action={tab === 'active' && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />{T('Создать цель')}</button>} />
      ) : <ul className="grid gap-3 md:grid-cols-2">{list.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} />)}</ul>}
      {editing && <GoalForm goal={typeof editing === 'string' ? undefined : editing} book={editing === 'book'} onClose={() => setEditing(null)} />}
    </div>
  );
}

function goalUnit(g: Goal, areas: { id: string; unit: keyof typeof AREA_UNITS }[]) {
  if (g.source === 'area') { const a = areas.find((x) => x.id === g.areaId); return a ? AREA_UNITS[a.unit].short : g.unit; }
  if (g.source === 'tasks') return T('задач');
  return g.unit;
}

function GoalCard({ g, onEdit }: { g: Goal; onEdit: () => void }) {
  const data = useData();
  const { today, areas } = data;
  const { toast, confirm } = useUI();
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const p = goalProgress(g, goalDone(g, data), today);
  const u = goalUnit(g, areas);
  const [rawLabel, cls] = STATE[p.state];
  const label = T(rawLabel);

  return (
    <li className="card grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{g.title}</p>
          <p className="text-xs text-muted">{GOAL_TYPES[g.type]} · {fmtShort(g.startDate)} — {fmtShort(g.endDate)}</p>
          {g.note && <p className="mt-1 text-xs text-muted">{g.note}</p>}
        </div>
        <span className={`chip shrink-0 ${cls}`}>{label}</span>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="tabular-nums"><b>{num(p.done)}</b> / {num(g.target)} {u}</span>
          <span className="font-semibold tabular-nums text-accent">{pct(p.pct)}</span>
        </div>
        <ProgressBar value={p.pct} tone={p.state === 'behind' || p.state === 'overdue' ? 'warn' : 'brand'} label={g.title} />
      </div>
      {p.state !== 'done' && (
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-soft p-2"><p className="text-[11px] text-muted">{T('Осталось')}</p><p className="tabular-nums font-medium">{num(p.remaining)}</p></div>
          <div className="rounded-xl bg-soft p-2"><p className="text-[11px] text-muted">{T('Дней')}</p><p className="tabular-nums font-medium">{p.daysLeft}</p></div>
          <div className="rounded-xl bg-soft p-2"><p className="text-[11px] text-muted">{T('Нужно в день')}</p><p className="tabular-nums font-medium">{p.daysLeft ? num(Math.ceil(p.pace * 10) / 10) : '—'}</p></div>
        </div>
      )}
      {p.state === 'behind' && <p className="text-xs text-muted">{T('К сегодняшнему дню по равномерному темпу ожидалось ≈')}{num(Math.round(p.expected))} {u}.</p>}
      {adding && (
        <form className="flex items-start gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const n = toNum(val);
          try { await addGoalProgress(g.id, today, n); setVal(''); setAdding(false); setErr(''); toast(T('Прогресс добавлен')); }
          catch (ex) { setErr(errMsg(ex)); }
        }}>
          <div className="flex-1">
            <label className="sr-only" htmlFor={`gv-${g.id}`}>{T('Сколько добавить')}</label>
            <input id={`gv-${g.id}`} className="input" type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`+ ${u}`} autoFocus />
            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          </div>
          <button className="btn btn-primary">{T('Добавить')}</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {g.source === 'manual' && g.status === 'active' && !adding && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Plus size={14} />{T('Прогресс')}</button>}
        {g.source !== 'manual' && <span className="text-xs text-muted self-center">{g.source === 'area' ? T('Прогресс из учебного направления') : T('Прогресс из выполненных связанных задач')}</span>}
        <button className="btn btn-sm btn-ghost" onClick={onEdit}><Pencil size={14} />{T('Изменить')}</button>
        {g.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => setGoalStatus(g.id, 'done')}><Check size={14} />{T('Завершить')}</button>}
        {g.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => setGoalStatus(g.id, 'archived')}><Archive size={14} />{T('В архив')}</button>}
        {g.status !== 'active' && <button className="btn btn-sm btn-ghost" onClick={() => setGoalStatus(g.id, 'active')}><RotateCcw size={14} />{T('Вернуть')}</button>}
        <button className="btn btn-sm btn-ghost !text-danger" onClick={async () => {
          if (await confirm({ title: T('Удалить цель?'), message: T('История прогресса цели будет удалена. Связанные задачи останутся.'), confirmText: T('Удалить'), danger: true })) { await deleteGoal(g.id); toast(T('Цель удалена')); }
        }}><Trash2 size={14} />{T('Удалить')}</button>
      </div>
    </li>
  );
}

const DEFAULT_SPAN: Record<GoalType, number> = { daily: 0, weekly: 6, monthly: 29, long: 89 };

function GoalForm({ goal, book, onClose }: { goal?: Goal; book: boolean; onClose: () => void }) {
  const { today, areas } = useData();
  const { toast } = useUI();
  const [d, setD] = useState({
    title: goal?.title ?? (book ? T('Прочитать книгу «»') : ''), type: (goal?.type ?? 'weekly') as GoalType,
    unit: goal?.unit ?? (book ? T('стр.') : ''), target: String(goal?.target ?? (book ? 300 : '')), initial: String(goal?.initial ?? 0),
    source: goal?.source ?? 'manual', areaId: goal?.areaId ?? '', startDate: goal?.startDate ?? today,
    endDate: goal?.endDate ?? addDays(today, book ? 4 : 6), note: goal?.note ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const preview = (() => {
    const input = toInput();
    if (Object.keys(validateGoal(input)).length) return null;
    return goalProgress({ ...input, id: '', log: goal?.log ?? [], status: 'active', createdAt: 0 }, input.initial + (goal?.log ?? []).reduce((a, l) => a + l.value, 0), today);
  })();

  function toInput(): GoalInput {
    return {
      title: d.title, type: d.type, unit: d.unit.trim() || T('ед.'), target: toNum(d.target), initial: d.initial.trim() ? toNum(d.initial) : 0,
      source: d.source as Goal['source'], areaId: d.areaId || undefined, startDate: d.startDate, endDate: d.endDate, note: d.note.slice(0, 500),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput();
    const errs = validateGoal(input);
    if (Object.keys(errs).length) return setErrors(errs);
    try { await saveGoal(input, goal?.id); toast(goal ? T('Цель обновлена') : T('Цель создана')); onClose(); }
    catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
  }

  return (
    <Modal open onClose={onClose} title={goal ? T('Изменить цель') : book ? T('Прочитать книгу') : T('Новая цель')}>
      <form className="grid gap-3" onSubmit={submit} noValidate>
        <Field label={book ? T('Название (с названием книги)') : T('Название')} error={errors.title} id="g-title"><input id="g-title" className="input" value={d.title} onChange={(e) => set('title', e.target.value)} autoFocus maxLength={200} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T('Тип')} id="g-type">
            <select id="g-type" className="input" value={d.type} onChange={(e) => {
              const t = e.target.value as GoalType;
              setD((p) => ({ ...p, type: t, endDate: goal ? p.endDate : addDays(p.startDate, DEFAULT_SPAN[t]) }));
            }}>
              {Object.entries(GOAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label={T('Источник прогресса')} id="g-src">
            <select id="g-src" className="input" value={d.source} onChange={(e) => set('source', e.target.value)}>
              <option value="manual">{T('Вручную')}</option>
              <option value="area" disabled={!areas.length}>{T('Учебное направление')}</option>
              <option value="tasks">{T('Выполненные задачи')}</option>
            </select>
          </Field>
        </div>
        {d.source === 'area' && (
          <Field label={T('Направление')} error={errors.areaId} id="g-area">
            <select id="g-area" className="input" value={d.areaId} onChange={(e) => set('areaId', e.target.value)}>
              <option value="">{T('— выберите —')}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({AREA_UNITS[a.unit].short})</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={T('Цель')} error={errors.target} id="g-target"><input id="g-target" type="number" min={1} className="input" value={d.target} onChange={(e) => set('target', e.target.value)} /></Field>
          <Field label={T('Уже сделано')} error={errors.initial} id="g-init"><input id="g-init" type="number" min={0} className="input" value={d.initial} onChange={(e) => set('initial', e.target.value)} /></Field>
          {d.source === 'manual' && <Field label={T('Единица')} id="g-unit"><input id="g-unit" className="input" value={d.unit} onChange={(e) => set('unit', e.target.value)} maxLength={20} placeholder={T('стр.')} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T('Начало')} error={errors.startDate} id="g-start"><input id="g-start" type="date" className="input" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label={T('Желаемое завершение')} error={errors.endDate} id="g-end"><input id="g-end" type="date" className="input" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        </div>
        <Field label={T('Заметка')} id="g-note"><input id="g-note" className="input" value={d.note} onChange={(e) => set('note', e.target.value)} maxLength={500} /></Field>
        {preview && d.source === 'manual' && (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{T('Осталось')}{' '}{num(preview.remaining)} {d.unit || T('ед.')}{' '}{T('за')}{' '}{preview.daysLeft}{' '}{T('дн. — нужно в среднем')}{' '}<b>{num(Math.ceil(preview.pace * 10) / 10)}</b>{' '}{T('в день.')}</p>
        )}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-outline" onClick={onClose}>{T('Отмена')}</button><button className="btn btn-primary">{T('Сохранить')}</button></div>
      </form>
    </Modal>
  );
}
