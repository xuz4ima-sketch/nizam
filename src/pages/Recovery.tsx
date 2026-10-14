import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CircleSlash, Feather, HeartHandshake, LifeBuoy, Zap } from 'lucide-react';
import { InstanceActions } from '../components/TaskItem';
import { Empty, Field, PageHeader, errMsg, useUI } from '../components/ui';
import { letGo, moveInstance, recoveryFrom, RECOVERY_WINDOW_DAYS, saveSettings, startTimer } from '../db/repo';
import { addDays, fmtMinutes, fmtShort, fmtTime } from '../lib/dates';
import { AREA_UNITS, num, SKIP_REASONS } from '../lib/labels';
import { areaProgress } from '../lib/progress';
import { isActive, isOverdue, occursOn, type Instance } from '../lib/recurrence';
import { findFreeSlot } from '../lib/slots';
import { applyMinimal, skipReasonCounts } from '../lib/stats';
import { useData, useInstances } from '../state/data';

export default function Recovery() {
  const { today, nowMin, settings, occurrences, areas, sessions, timer } = useData();
  const { toast } = useUI();
  const nav = useNavigate();
  const recent = useInstances(recoveryFrom(today), today);
  const tomorrowInsts = useInstances(addDays(today, 1), addDays(today, 1));
  const todayInsts = recent.filter((i) => i.date === today);
  const missed = recent.filter((i) => isOverdue(i, today, nowMin) || (i.status === 'skipped' && i.date < today));
  const open = todayInsts.filter((i) => isActive(i) && i.status !== 'done' && i.status !== 'skipped');
  const [five, setFive] = useState(open[0]?.key ?? '');
  const [act, setAct] = useState<Instance | null>(null);
  const minimal = settings.minimalDate === today;
  const reasons = skipReasonCounts(occurrences, addDays(today, -29), today);
  const maxR = Math.max(1, ...reasons.map((r) => r[1]));
  const debts = areas.filter((a) => a.carryOver).map((a) => ({ a, p: areaProgress(a, sessions, today, settings.weekStart, settings.timeZone) })).filter((x) => x.p.yesterdayDeficit > 0);

  async function startFive() {
    const inst = open.find((i) => i.key === five);
    if (!inst) return toast('Выберите задачу', 'error');
    if (timer) { nav('/focus'); return; }
    try {
      await startTimer({ mode: 'five', label: inst.title, taskId: inst.task.id, occKey: inst.key, areaId: inst.task.studyAreaId });
      nav('/focus');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  async function moveTo(inst: Instance, date: string, list: Instance[]) {
    const slot = findFreeSlot(list.filter((i) => i.key !== inst.key), inst.durationMin, settings.dayStart, settings.dayEnd, date === today ? nowMin : 0);
    try {
      await moveInstance(inst, date, slot !== null ? fmtTime(slot) : undefined);
      toast(`Перенесено на ${date === today ? 'сегодня' : 'завтра'}${slot !== null ? ` в ${fmtTime(slot)}` : ' (без времени)'}`);
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title="Восстановление дисциплины" subtitle="Срывы случаются. Главное — мягко вернуться в ритм, а не копить бесконечный долг." />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card grid content-start gap-3">
          <h2 className="h2 flex items-center gap-2"><Zap size={18} className="text-accent" />Начни с 5 минут</h2>
          <p className="muted">Выберите большую задачу и сделайте её самую маленькую часть. Пять минут — и можно остановиться.</p>
          {open.length ? (
            <>
              <Field label="Задача" id="r-five">
                <select id="r-five" className="input" value={five} onChange={(e) => setFive(e.target.value)}>
                  {open.map((i) => <option key={i.key} value={i.key}>{i.title}</option>)}
                </select>
              </Field>
              <button className="btn btn-primary" onClick={startFive}><Zap size={18} />Начать 5 минут</button>
            </>
          ) : <p className="text-sm text-muted">На сегодня нет открытых задач.</p>}
        </section>

        <section className="card grid content-start gap-3">
          <h2 className="h2 flex items-center gap-2"><Feather size={18} className="text-accent" />Минимальный день</h2>
          <p className="muted">Устали или не успеваете? Оставьте на сегодня только важнейшие дела (отмеченные «Минимальный день», либо три самых приоритетных).</p>
          {!minimal ? (
            <>
              <ul className="text-sm">{applyMinimal(open).map((i) => <li key={i.key}>· {i.title}</li>)}</ul>
              <button className="btn btn-primary" onClick={() => saveSettings({ minimalDate: today }).then(() => toast('Минимальный день включён'))}>Включить на сегодня</button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={() => saveSettings({ minimalDate: undefined })}>Вернуть обычный режим</button>
          )}
        </section>
      </div>

      <section className="grid gap-3">
        <div>
          <h2 className="h2 flex items-center gap-2"><LifeBuoy size={18} className="text-accent" />Невыполненное за {RECOVERY_WINDOW_DAYS} дней</h2>
          <p className="muted">Перенос выполняется только по вашему нажатию. Старше {RECOVERY_WINDOW_DAYS} дней задачи здесь не накапливаются.</p>
        </div>
        {!missed.length ? (
          <Empty icon={<HeartHandshake size={28} />} title="Долгов нет" text="Все задачи последних дней выполнены, перенесены или отпущены." />
        ) : (
          <ul className="grid gap-2">
            {missed.map((i) => {
              const recurringToday = i.task.recurrence.kind !== 'none' && occursOn(i.task, today) && i.date < today;
              return (
                <li key={i.key} className="card grid gap-2 !p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{i.title}</p>
                    <span className="text-xs text-muted">
                      {fmtShort(i.date)} · {fmtMinutes(i.durationMin)} · {i.status === 'skipped' ? `пропуск${i.skipReason ? `: ${SKIP_REASONS[i.skipReason].toLowerCase()}` : ''}` : 'просрочено'}
                    </span>
                  </div>
                  {recurringToday && <p className="text-xs text-muted">Это повторяющееся занятие — сегодня оно уже есть в плане. Возможно, его лучше отпустить.</p>}
                  <div className="flex flex-wrap gap-2">
                    {i.date < today && <button className="btn btn-sm btn-outline" onClick={() => moveTo(i, today, todayInsts)}><CalendarClock size={14} />На сегодня</button>}
                    <button className="btn btn-sm btn-outline" onClick={() => moveTo(i, addDays(today, 1), tomorrowInsts)}><CalendarClock size={14} />На завтра</button>
                    {i.status !== 'skipped' && <button className="btn btn-sm btn-ghost" onClick={() => setAct(i)}><CircleSlash size={14} />Указать причину</button>}
                    <button className="btn btn-sm btn-ghost" onClick={() => letGo(i, i.skipReason ?? 'other').then(() => toast('Задача отпущена'))}>Отпустить</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {debts.length > 0 && (
        <section className="card grid gap-2">
          <h2 className="h2">Компенсация норм</h2>
          <p className="muted">Для этих направлений вы включили перенос недовыполненного. Подтвердите его в разделе «Обучение».</p>
          <ul className="text-sm">{debts.map(({ a, p }) => <li key={a.id}>· {a.name}: вчера недовыполнено {num(p.yesterdayDeficit)} {AREA_UNITS[a.unit].short}</li>)}</ul>
          <Link to="/study" className="btn btn-sm btn-outline justify-self-start">Открыть «Обучение»</Link>
        </section>
      )}

      <section className="card grid gap-3">
        <h2 className="h2">Анализ пропусков за 30 дней</h2>
        {!reasons.length ? <p className="muted">Пропусков с указанной причиной нет.</p> : (
          <ul className="grid gap-2">
            {reasons.map(([r, n]) => (
              <li key={r} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate">{SKIP_REASONS[r]}</span>
                <div className="h-2.5 rounded-full bg-soft"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(n / maxR) * 100}%` }} /></div>
                <span className="text-right tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {act && <InstanceActions inst={act} initial="skip" onClose={() => setAct(null)} />}
    </div>
  );
}
