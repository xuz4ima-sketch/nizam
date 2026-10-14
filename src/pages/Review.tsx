import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Star } from 'lucide-react';
import { Field, PageHeader, Tabs, errMsg, useUI } from '../components/ui';
import type { ISODate } from '../db/schema';
import { saveReview } from '../db/repo';
import { addDays, fmtDate, fmtLong, fmtMinutes, fmtShort, startOfWeek } from '../lib/dates';
import { pct, SKIP_REASONS, STATUS_LABEL } from '../lib/labels';
import { goalDone, goalProgress } from '../lib/progress';
import { isActive, isOverdue } from '../lib/recurrence';
import { weeklyRecommendations } from '../lib/recommend';
import { dayStat, dayStats, minutesByWeekday, postponedRanking, skipReasonCounts, summarize } from '../lib/stats';
import { useData, useInstances } from '../state/data';

export default function Review() {
  const [tab, setTab] = useState<'day' | 'week'>('day');
  return (
    <div className="fade-in grid gap-5">
      <PageHeader title="Обзор" subtitle="Короткая рефлексия помогает планировать реалистично." actions={<Tabs label="Период" value={tab} onChange={setTab} items={[['day', 'День'], ['week', 'Неделя']]} />} />
      {tab === 'day' ? <DayReview /> : <WeekReview />}
    </div>
  );
}

function DayReview() {
  const { today, nowMin, sessions, reviews } = useData();
  const { toast } = useUI();
  const [date, setDate] = useState<ISODate>(today);
  const insts = useInstances(date, date);
  const st = dayStat(date, insts, sessions, today, nowMin);
  const existing = reviews.find((r) => r.date === date);
  const doneList = insts.filter((i) => i.status === 'done' || i.status === 'partial');
  const missedList = insts.filter((i) => isActive(i) && (i.status === 'skipped' || isOverdue(i, today, nowMin)));
  const [f, setF] = useState({ achieved: '', missed: '', obstacles: '', improve: '', rating: 0 });

  useEffect(() => {
    setF(existing
      ? { achieved: existing.achieved, missed: existing.missed, obstacles: existing.obstacles, improve: existing.improve, rating: existing.rating }
      : {
        achieved: doneList.map((i) => `• ${i.title}${i.status === 'partial' ? ' (частично)' : ''}`).join('\n'),
        missed: missedList.map((i) => `• ${i.title}${i.skipReason ? ` — ${SKIP_REASONS[i.skipReason].toLowerCase()}` : ''}`).join('\n'),
        obstacles: '', improve: '', rating: 0,
      });
  }, [date, existing?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <form className="card grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        try { await saveReview({ date, ...f }); toast('Обзор дня сохранён'); } catch (err) { toast(errMsg(err), 'error'); }
      }}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setDate(addDays(date, -1))} aria-label="Предыдущий день"><ChevronLeft size={18} /></button>
          <p className="text-center font-medium">{fmtLong(date)}</p>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Следующий день"><ChevronRight size={18} /></button>
        </div>
        <Field label="Что удалось выполнить?" id="rv-a"><textarea id="rv-a" className="input min-h-20" value={f.achieved} onChange={(e) => set('achieved', e.target.value)} maxLength={3000} /></Field>
        <Field label="Что было пропущено?" id="rv-m"><textarea id="rv-m" className="input min-h-16" value={f.missed} onChange={(e) => set('missed', e.target.value)} maxLength={3000} /></Field>
        <Field label="Что мешало?" id="rv-o"><textarea id="rv-o" className="input min-h-16" value={f.obstacles} onChange={(e) => set('obstacles', e.target.value)} maxLength={3000} /></Field>
        <Field label="Что можно улучшить завтра?" id="rv-i"><textarea id="rv-i" className="input min-h-16" value={f.improve} onChange={(e) => set('improve', e.target.value)} maxLength={3000} /></Field>
        <fieldset>
          <legend className="label">Оценка дня</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => set('rating', f.rating === n ? 0 : n)} aria-label={`Оценка ${n}`} aria-pressed={f.rating >= n}
                className="btn btn-ghost btn-icon"><Star size={22} className={f.rating >= n ? 'fill-amber-400 text-amber-400' : 'text-muted'} /></button>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary justify-self-end">{existing ? 'Обновить обзор' : 'Сохранить обзор'}</button>
      </form>

      <aside className="grid content-start gap-3">
        <div className="card text-sm">
          <h2 className="h2 mb-2">Краткий отчёт</h2>
          <p>Задач: {st.planned}, выполнено {st.done}{st.partial ? `, частично ${st.partial}` : ''}, пропущено {st.skipped}{st.overdue ? `, просрочено ${st.overdue}` : ''}.</p>
          <p>Прогресс дня: <b>{pct(st.progress)}</b>. Время: {fmtMinutes(st.actualMin)} из запланированных {fmtMinutes(st.plannedMin)}.</p>
          {existing?.improve && <p className="mt-2"><b>План на завтра:</b> {existing.improve}</p>}
          {!existing && <p className="mt-2 text-muted">Ответы ещё не сохранены — поля заполнены автоматически по фактическим данным, их можно изменить.</p>}
        </div>
        <div className="card">
          <h2 className="h2 mb-2">Прошлые обзоры</h2>
          {!reviews.length ? <p className="muted">Пока нет сохранённых обзоров.</p> : (
            <ul className="grid gap-1 text-sm">
              {[...reviews].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map((r) => (
                <li key={r.date}>
                  <button className="flex w-full justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-soft" onClick={() => setDate(r.date)}>
                    <span >{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function WeekReview() {
  const data = useData();
  const { today, nowMin, sessions, occurrences, goals, settings } = data;
  const [offset, setOffset] = useState(0);
  const from = addDays(startOfWeek(today, settings.weekStart), -7 * offset);
  const to = addDays(from, 6) < today ? addDays(from, 6) : today;
  const prevFrom = addDays(from, -7);
  const insts = useInstances(prevFrom, to);
  const days = useMemo(() => dayStats(from, to, insts, sessions, today, nowMin), [from, to, insts, sessions, today, nowMin]);
  const prevDays = useMemo(() => dayStats(prevFrom, addDays(from, -1), insts, sessions, today, nowMin), [prevFrom, from, insts, sessions, today, nowMin]);
  const sum = summarize(days);
  const reasons = skipReasonCounts(occurrences, from, to);
  const postponed = postponedRanking(insts.filter((i) => i.date >= from), today, nowMin);
  const byWd = minutesByWeekday(days);
  const recs = weeklyRecommendations({ days, prevDays, reasons, postponed, byWeekday: byWd });
  const bestDays = [...days].filter((d) => d.actualMin > 0).sort((a, b) => b.actualMin - a.actualMin).slice(0, 3);
  const activeGoals = goals.filter((g) => g.status !== 'archived' && g.startDate <= to && g.endDate >= from);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-outline btn-icon" onClick={() => setOffset(offset + 1)} aria-label="Предыдущая неделя"><ChevronLeft size={18} /></button>
        <p className="font-medium">{fmtShort(from)} — {fmtShort(addDays(from, 6))}</p>
        <button className="btn btn-outline btn-icon" onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label="Следующая неделя"><ChevronRight size={18} /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card grid content-start gap-2 text-sm">
          <h2 className="h2">Итоги недели</h2>
          <p>Суммарное время занятий: <b>{fmtMinutes(sum.actualMin)}</b></p>
          <p>Задачи: выполнено {sum.done} из {sum.planned} ({pct(sum.doneRate)}), пропущено {sum.skipped}.</p>
          <div>
            <p className="font-medium">Наиболее продуктивные дни:</p>
            {bestDays.length ? <ul>{bestDays.map((d) => <li key={d.date}>· {fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })} — {fmtMinutes(d.actualMin)}</li>)}</ul> : <p className="text-muted">Нет записанного времени.</p>}
          </div>
          <div>
            <p className="font-medium">Частые причины пропусков:</p>
            {reasons.length ? <ul>{reasons.slice(0, 3).map(([r, n]) => <li key={r}>· {SKIP_REASONS[r]} — {n}</li>)}</ul> : <p className="text-muted">Пропусков с причиной нет.</p>}
          </div>
        </section>
        <section className="card grid content-start gap-2 text-sm">
          <h2 className="h2">Достижение целей</h2>
          {!activeGoals.length ? <p className="muted">Нет целей на эту неделю.</p> : (
            <ul className="grid gap-1.5">
              {activeGoals.map((g) => {
                const p = goalProgress(g, goalDone(g, data), today);
                return <li key={g.id} className="flex justify-between gap-2"><span className="truncate">{g.title}</span><span className="shrink-0 tabular-nums text-muted">{pct(p.pct)} · {p.state === 'done' ? 'достигнута' : p.state === 'behind' ? 'отставание' : p.state === 'overdue' ? 'срок прошёл' : 'в процессе'}</span></li>;
              })}
            </ul>
          )}
        </section>
      </div>
      <section className="card grid gap-3">
        <h2 className="h2 flex items-center gap-2"><Lightbulb size={18} className="text-amber-500" />Рекомендации по расписанию</h2>
        <p className="text-xs text-muted">Сформированы простыми прозрачными правилами по вашим данным (без ИИ). Под каждой — причина.</p>
        <ul className="grid gap-2">
          {recs.map((r, i) => (
            <li key={i} className="rounded-xl bg-soft px-3 py-2 text-sm">
              <p>{r.text}</p>
              <p className="text-xs text-muted">{r.why}</p>
            </li>
          ))}
        </ul>
      </section>
      {insts.length === 0 && <p className="muted">{STATUS_LABEL.planned}: задач за неделю нет.</p>}
    </div>
  );
}
