import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, Download, LifeBuoy, ListChecks, Plus, Sparkles, Star, Timer } from 'lucide-react';
import { TaskForm } from '../components/TaskForm';
import { TaskItem } from '../components/TaskItem';
import { Empty, ProgressBar, Stat, useUI, errMsg } from '../components/ui';
import { seedDemoPlan } from '../db/seed';
import { saveSettings } from '../db/repo';
import { fmtLong, fmtMinutes, fmtTime, parseTime } from '../lib/dates';
import { AREA_UNITS, num, pct } from '../lib/labels';
import { areaProgress, goalDone, goalProgress } from '../lib/progress';
import { applyMinimal, dayStat, nextUp, topThree } from '../lib/stats';
import { useData, useInstances } from '../state/data';

function greeting(min: number) {
  if (min < 5 * 60) return 'Доброй ночи';
  if (min < 12 * 60) return 'Доброе утро';
  if (min < 18 * 60) return 'Добрый день';
  return 'Добрый вечер';
}

export function Dashboard() {
  const data = useData();
  const { today, nowMin, settings, sessions, areas, goals, tasks, timer } = data;
  const { toast } = useUI();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const all = useInstances(today, today);
  const minimal = settings.minimalDate === today;
  const list = useMemo(() => (minimal ? applyMinimal(all) : all), [all, minimal]);
  const st = useMemo(() => dayStat(today, list, sessions, today, nowMin), [today, list, sessions, nowMin]);
  const next = nextUp(list, today, nowMin);
  const top = topThree(list);
  const activeGoals = goals.filter((g) => g.status === 'active').slice(0, 4);
  const backupOld = !settings.lastBackupAt || Date.now() - settings.lastBackupAt > 7 * 864e5;
  const empty = tasks.length === 0 && areas.length === 0;

  async function demo() {
    try {
      const n = await seedDemoPlan(today);
      toast(n ? `Добавлен демонстрационный план: ${n} направлений` : 'Демо-план уже добавлен');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div className="fade-in grid gap-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtLong(today)}</p>
          <h1 className="h1 mt-0.5">{greeting(nowMin)}{settings.name ? `, ${settings.name}` : ''}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Задача</button>
          <button className="btn btn-outline" onClick={() => nav('/focus')}><Timer size={18} />{timer ? 'К сеансу' : 'Концентрация'}</button>
        </div>
      </section>

      {minimal && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span><b>Минимальный день.</b> Показаны только самые важные дела. Это нормально — главное не прерывать ритм.</span>
          <button className="btn btn-sm btn-outline" onClick={() => saveSettings({ minimalDate: undefined })}>Обычный режим</button>
        </div>
      )}

      {empty ? (
        <div className="card grid gap-4">
          <div>
            <h2 className="h2 flex items-center gap-2"><Sparkles size={18} className="text-accent" />Добро пожаловать в НИЗАМ</h2>
            <p className="muted mt-1">Начните с одной задачи — или установите демонстрационный учебный план и отредактируйте его под себя.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Создать задачу</button>
            <button className="btn btn-outline" onClick={demo}><ListChecks size={18} />Установить демо-план</button>
            <Link to="/settings" className="btn btn-ghost"><Download size={18} />Импорт из копии</Link>
          </div>
          <p className="text-xs text-muted">Демо-план — это редактируемый пример (Коран, арабский, программирование и др.), а не обязательные нормы. Время занятий не назначается автоматически.</p>
        </div>
      ) : (
        <>
          <section className="card grid gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="h2">Прогресс дня</h2>
              <span className="text-2xl font-semibold tabular-nums text-accent">{pct(st.progress)}</span>
            </div>
            <ProgressBar value={st.progress} label="Прогресс дня" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Запланировано" value={fmtMinutes(st.plannedMin)} sub={`${st.planned} задач`} />
              <Stat label="Фактически" value={fmtMinutes(st.actualMin)} sub="сохранённое время" />
              <Stat label="Выполнено" value={st.done} sub={st.partial ? `частично: ${st.partial}` : undefined} />
              <Stat label="Не завершено / пропущено" value={`${st.pending + st.overdue} / ${st.skipped}`} sub={st.overdue ? `просрочено: ${st.overdue}` : undefined} />
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <section className="grid content-start gap-3">
              {next && (
                <div className="card flex items-center gap-3 !py-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Timer size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Ближайшее занятие</p>
                    <p className="truncate font-medium">{next.title}</p>
                  </div>
                  <span className="tabular-nums text-sm font-medium">{fmtTime(parseTime(next.startTime) ?? 0)}</span>
                </div>
              )}
              {top.length > 0 && (
                <div className="card">
                  <h2 className="h2 mb-2 flex items-center gap-2"><Star size={16} className="text-amber-500" />Три главные задачи</h2>
                  <ol className="grid gap-1.5">
                    {top.map((i, n) => (
                      <li key={i.key} className="flex items-center gap-2 text-sm">
                        <span className="grid size-5 place-items-center rounded-full bg-soft text-xs font-semibold">{n + 1}</span>
                        <span className={`truncate ${i.status === 'done' ? 'text-muted line-through' : ''}`}>{i.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex items-center justify-between">
                <h2 className="h2">Задачи на сегодня</h2>
                <Link to="/plan" className="text-sm font-medium text-accent hover:underline">Весь план</Link>
              </div>
              {list.length ? (
                <ul className="grid gap-2">{list.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>
              ) : (
                <Empty icon={<CalendarPlus size={28} />} title="На сегодня задач нет" text="Добавьте задачу или запланируйте повторяющееся занятие."
                  action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Добавить</button>} />
              )}
              {!minimal && list.length > 3 && (
                <button className="btn btn-ghost justify-start text-muted" onClick={() => saveSettings({ minimalDate: today })}>
                  <LifeBuoy size={16} />Тяжёлый день? Включить «Минимальный день»
                </button>
              )}
            </section>

            <aside className="grid content-start gap-3">
              {areas.length > 0 && (
                <div className="card">
                  <div className="mb-3 flex items-center justify-between"><h2 className="h2">Обучение сегодня</h2><Link to="/study" className="text-sm text-accent hover:underline">Все</Link></div>
                  <ul className="grid gap-3">
                    {areas.filter((a) => a.dailyTarget > 0).slice(0, 6).map((a) => {
                      const p = areaProgress(a, sessions, today, settings.weekStart, settings.timeZone);
                      return (
                        <li key={a.id}>
                          <div className="mb-1 flex justify-between gap-2 text-sm">
                            <span className="truncate">{a.name}</span>
                            <span className="shrink-0 tabular-nums text-muted">{num(p.doneToday)} / {num(p.targetToday)} {AREA_UNITS[a.unit].short}</span>
                          </div>
                          <ProgressBar value={p.pctToday} size="sm" label={a.name} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="card">
                <div className="mb-3 flex items-center justify-between"><h2 className="h2">Цели</h2><Link to="/goals" className="text-sm text-accent hover:underline">Все</Link></div>
                {activeGoals.length ? (
                  <ul className="grid gap-3">
                    {activeGoals.map((g) => {
                      const p = goalProgress(g, goalDone(g, data), today);
                      return (
                        <li key={g.id}>
                          <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{g.title}</span><span className="tabular-nums text-muted">{pct(p.pct)}</span></div>
                          <ProgressBar value={p.pct} size="sm" tone={p.state === 'behind' || p.state === 'overdue' ? 'warn' : 'brand'} label={g.title} />
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="muted">Целей пока нет. <Link to="/goals" className="text-accent hover:underline">Создать цель</Link></p>}
              </div>
              {backupOld && (
                <Link to="/settings" className="card flex items-center gap-3 !py-3 text-sm hover:bg-soft">
                  <Download size={18} className="text-accent" />
                  <span>{settings.lastBackupAt ? 'Резервной копии больше недели.' : 'Резервная копия ещё не создавалась.'} Сохраните данные в файл.</span>
                </Link>
              )}
            </aside>
          </div>
        </>
      )}
      <TaskForm open={adding} onClose={() => setAdding(false)} defaultDate={today} />
    </div>
  );
}
