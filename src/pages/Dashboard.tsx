import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, CalendarPlus, Download, Feather, Flame, GraduationCap, ListChecks, Pencil, Play, Plus, Sparkles, Timer,
} from 'lucide-react';
import { HeroArt, StarPattern } from '../components/Art';
import { ChartLegend, MiniCalendar, useMediaQuery, useThemeColors } from '../components/charts';
import { useQuickAdd } from '../components/Layout';
import { TaskItem } from '../components/TaskItem';
import { Empty, Field, IconBadge, Modal, ProgressBar, Ring, SectionHeader, Tabs, errFields, errMsg, useUI } from '../components/ui';
import { saveSettings, startTimer } from '../db/repo';
import { seedDemoPlan } from '../db/seed';
import type { StudyArea } from '../db/schema';
import { fmtDate, fmtHijri, fmtMinutes, HIJRI_METHOD, parseTime, showTime, startOfWeek } from '../lib/dates';
import { AREA_UNITS, num } from '../lib/labels';
import { areaProgress } from '../lib/progress';
import type { Instance } from '../lib/recurrence';
import { reminderFor } from '../lib/reminders';
import { applyMinimal, dayStat, nextUp, topThree, type DayStat } from '../lib/stats';
import { habitsToday } from '../lib/streaks';
import type { Errors } from '../lib/validate';
import { useData, useInstances } from '../state/data';

type Filter = 'all' | 'open' | 'done';

const LazyWeekChart = lazy(() => import('../components/WeekChart'));
function WeekChart(props: { from: string; height?: number }) {
  return <Suspense fallback={<div className="skeleton" style={{ height: props.height ?? 170 }} />}><LazyWeekChart {...props} /></Suspense>;
}

export function Dashboard() {
  const data = useData();
  const { today, nowMin, settings, sessions, areas, tasks, habits, habitLogs } = data;
  const all = useInstances(today, today);
  const minimal = settings.minimalDate === today;
  const list = useMemo(() => (minimal ? applyMinimal(all) : all), [all, minimal]);
  const st = useMemo(() => dayStat(today, list, sessions, today, nowMin), [today, list, sessions, nowMin]);
  const hab = habitsToday(habits, habitLogs, today, settings.weekStart);
  const study = useMemo(() => {
    const act = areas.filter((a) => a.dailyTarget > 0);
    if (!act.length) return null;
    const ps = act.map((a) => Math.min(1, areaProgress(a, sessions, today, settings.weekStart, settings.timeZone).pctToday));
    return { value: ps.reduce((x, y) => x + y, 0) / ps.length, count: act.length };
  }, [areas, sessions, today, settings.weekStart, settings.timeZone]);
  const wide = useMediaQuery('(min-width: 1024px)');
  const xl = useMediaQuery('(min-width: 1280px)');
  const empty = tasks.length === 0 && areas.length === 0 && habits.length === 0;

  const hero = <Hero st={st} />;
  const metrics = <Metrics st={st} hab={hab} study={study} />;
  const tasksCard = <TodayTasks list={list} />;
  const next = <NextUp list={list} />;
  const top = <TopThree list={list} />;
  const side = <SidePanel />;

  return (
    <div className="grid gap-5">
      {minimal && (
        <div className="fade-in flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><Feather size={16} className="text-warn" /><span><b>Минимальный день.</b> Показаны только самые важные дела — главное не прерывать ритм.</span></span>
          <button className="btn btn-sm btn-outline" onClick={() => saveSettings({ minimalDate: undefined })}>Обычный режим</button>
        </div>
      )}
      {empty ? (
        <>
          {hero}
          <Welcome />
        </>
      ) : wide ? (
        <div className={`grid gap-5 ${xl ? 'grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="grid min-w-0 content-start gap-5">
            {hero}
            {metrics}
            <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5">
              {tasksCard}
              <div className="grid content-start gap-5">{next}{top}</div>
            </div>
          </div>
          {xl ? <div className="grid content-start gap-5">{settings.showReminder && <ReminderCard />}{side}</div>
            : <div className="grid grid-cols-2 items-start gap-5">{settings.showReminder && <ReminderCard />}{side}</div>}
        </div>
      ) : (
        <div className="grid gap-4">
          {hero}
          <MobileSummary st={st} hab={hab} study={study} />
          {next}
          {tasksCard}
          {top}
          <StudyCard />
          <div className="card"><SectionHeader title="Неделя" action={<Link to="/stats" className="link">Статистика</Link>} /><WeekChart from={startOfWeek(today, settings.weekStart)} /><WeekLegend /></div>
          {settings.showReminder && <ReminderCard />}
        </div>
      )}
    </div>
  );
}

/* ---------- Приветствие ---------- */
function dayStatus(st: DayStat) {
  if (!st.planned) return 'На сегодня задач нет — можно спокойно спланировать день';
  if (st.done === st.planned) return 'Все задачи выполнены. Машаллах!';
  const left = st.planned - st.done - st.skipped;
  return `Запланировано ${st.planned} · выполнено ${st.done}${left > 0 ? ` · осталось ${left}` : ''}${st.overdue ? ` · просрочено ${st.overdue}` : ''}`;
}

function Hero({ st }: { st: DayStat }) {
  const { today, settings } = useData();
  const [edit, setEdit] = useState(false);
  const hijri = settings.showHijri ? fmtHijri(today) : null;
  return (
    <>
      <section className="fade-in relative min-h-[196px] overflow-hidden rounded-[22px] border border-line" style={{ background: 'linear-gradient(180deg, var(--art-sky1), var(--art-sky2))' }} aria-label="Приветствие">
        <HeroArt className="absolute inset-y-0 right-0 h-full w-[78%] sm:w-full" />
        <div className="absolute inset-y-0 left-0 w-[72%] bg-gradient-to-r from-[var(--art-sky1)] via-[var(--art-sky1)]/85 to-transparent sm:hidden" aria-hidden />
        <div className="relative flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
          <div className="max-w-[64%] sm:max-w-[min(460px,54%)]">
            <div className="flex items-start gap-2">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-accent-strong dark:text-fg sm:text-[26px]">{settings.greetTitle || 'Ас-саляму алейкум!'}</h1>
              <button className="btn btn-ghost btn-icon -mt-1 !min-h-8 !min-w-8 !p-1 text-muted opacity-70 hover:opacity-100" onClick={() => setEdit(true)} aria-label="Изменить приветствие"><Pencil size={15} /></button>
            </div>
            {settings.greetText && <p className="mt-1.5 text-[13px] text-fg/80 sm:text-[14px]">{settings.greetText}</p>}
          </div>
          <div className="max-w-[72%] sm:max-w-[min(480px,58%)]">
            <p className="text-[15px] font-bold">{fmtDate(today, { weekday: 'long' })}, {fmtDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            {hijri && <p className="text-[13px] font-medium text-muted" title={`Календарь: ${HIJRI_METHOD}. Возможна разница ±1 день с местным календарём.`}>{hijri}</p>}
            <p className="mt-2 inline-flex rounded-full bg-card/80 px-3 py-1 text-[12px] font-semibold text-accent backdrop-blur dark:bg-black/25">{dayStatus(st)}</p>
          </div>
        </div>
      </section>
      {edit && <GreetingForm onClose={() => setEdit(false)} />}
    </>
  );
}

function ReminderCard() {
  const { today } = useData();
  const r = reminderFor(today);
  return (
    <section className="fade-in relative overflow-hidden rounded-[22px] bg-brand-900 p-5 text-white" aria-label="Напоминание дня">
      <StarPattern className="absolute inset-0" opacity={0.14} color="#c4a56b" size={40} />
      <div className="relative">
        <p className="eyebrow !text-gold/90">{r.kind === 'quran' ? 'Аят дня' : 'Хадис дня'}</p>
        <p className="arabic mt-2 text-[20px] leading-[2] text-gold" lang="ar" dir="rtl">{r.arabic}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-white/90">«{r.meaning}»</p>
        <p className="mt-2 text-[11.5px] text-white/60">{r.source} · смысловой перевод</p>
      </div>
    </section>
  );
}

function GreetingForm({ onClose }: { onClose: () => void }) {
  const { settings } = useData();
  const { toast } = useUI();
  const [t, setT] = useState(settings.greetTitle);
  const [x, setX] = useState(settings.greetText);
  const [errors, setErrors] = useState<Errors>({});
  return (
    <Modal open onClose={onClose} title="Приветствие на главной">
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        try { await saveSettings({ greetTitle: t.trim(), greetText: x.trim() }); toast('Приветствие сохранено'); onClose(); }
        catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
      }}>
        <Field label="Заголовок" error={errors.greetTitle} id="g-t"><input id="g-t" className="input" value={t} maxLength={80} onChange={(e) => setT(e.target.value)} /></Field>
        <Field label="Текст" error={errors.greetText} id="g-x"><textarea id="g-x" className="input min-h-20" value={x} maxLength={200} onChange={(e) => setX(e.target.value)} /></Field>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => { setT('Ас-саляму алейкум!'); setX('Сегодня хороший день, чтобы сделать ещё один шаг к своим целям.'); }}>По умолчанию</button>
          <div className="flex gap-2"><button type="button" className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary">Сохранить</button></div>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Показатели ---------- */
type Hab = { done: number; total: number };
type Study = { value: number; count: number } | null;

function MetricCard({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; to: string }) {
  return (
    <Link to={to} className="card group flex min-w-0 flex-col gap-2 !p-4 transition-colors hover:border-accent/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold leading-snug text-muted">{label}</p>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[24px] font-extrabold leading-tight tracking-tight tabular-nums">{value}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{sub}</p>
      </div>
    </Link>
  );
}

function Metrics({ st, hab, study }: { st: DayStat; hab: Hab; study: Study }) {
  const pct = Math.round(st.progress * 100);
  return (
    <div className="stagger grid grid-cols-2 gap-4 2xl:grid-cols-4 xl:grid-cols-4">
      <MetricCard to="/tasks" label="Прогресс за сегодня" value={`${pct}%`}
        sub={st.planned ? `${st.done} из ${st.planned} задач${st.partial ? ` · частично ${st.partial}` : ''}` : 'задач нет'}
        icon={<Ring value={st.progress} size={40} stroke={5} label="Прогресс дня" />} />
      <MetricCard to="/focus" label="Время концентрации" value={st.actualMin ? fmtMinutes(st.actualMin) : '0 мин'}
        sub={st.plannedMin ? `план ${fmtMinutes(st.plannedMin)}` : 'сохранённое время'}
        icon={<IconBadge tone="gold" size={40}><Timer size={19} /></IconBadge>} />
      <MetricCard to="/habits" label="Привычки" value={hab.total ? `${hab.done} из ${hab.total}` : '—'}
        sub={hab.total ? 'выполнено сегодня' : 'привычек пока нет'}
        icon={<IconBadge size={40}><Flame size={19} /></IconBadge>} />
      <MetricCard to="/study" label="Учебные цели" value={study ? `${Math.round(study.value * 100)}%` : '—'}
        sub={study ? `${study.count} направлений сегодня` : 'направлений пока нет'}
        icon={<IconBadge tone="info" size={40}><BookOpen size={19} /></IconBadge>} />
    </div>
  );
}

function MobileSummary({ st, hab, study }: { st: DayStat; hab: Hab; study: Study }) {
  return (
    <section className="card fade-in grid grid-cols-[auto_1fr] items-center gap-4 !p-4" aria-label="Общий прогресс">
      <Ring value={st.progress} size={92} stroke={9} label="Прогресс дня">
        <div><p className="text-[22px] font-extrabold tabular-nums leading-none">{Math.round(st.progress * 100)}%</p><p className="mt-0.5 text-[10px] font-semibold text-muted">{st.done}/{st.planned}</p></div>
      </Ring>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Link to="/habits" className="rounded-xl bg-soft px-1 py-2.5"><Flame size={16} className="mx-auto text-accent" /><p className="mt-1 text-[15px] font-extrabold tabular-nums">{hab.total ? `${hab.done}/${hab.total}` : '—'}</p><p className="text-[10.5px] font-semibold text-muted">Привычки</p></Link>
        <Link to="/focus" className="rounded-xl bg-soft px-1 py-2.5"><Timer size={16} className="mx-auto text-gold" /><p className="mt-1 text-[15px] font-extrabold tabular-nums">{fmtShortMin(st.actualMin)}</p><p className="text-[10.5px] font-semibold text-muted">Фокус</p></Link>
        <Link to="/study" className="rounded-xl bg-soft px-1 py-2.5"><BookOpen size={16} className="mx-auto text-info" /><p className="mt-1 text-[15px] font-extrabold tabular-nums">{study ? `${Math.round(study.value * 100)}%` : '—'}</p><p className="text-[10.5px] font-semibold text-muted">Учёба</p></Link>
      </div>
    </section>
  );
}
const fmtShortMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}ч${m % 60 ? ` ${m % 60}м` : ''}` : `${Math.round(m)}м`);

/* ---------- Задачи ---------- */
function TodayTasks({ list }: { list: Instance[] }) {
  const { today, settings } = useData();
  const { openTask } = useQuickAdd();
  const [f, setF] = useState<Filter>('all');
  const open = list.filter((i) => i.status === 'planned' || i.status === 'partial');
  const done = list.filter((i) => i.status === 'done');
  const shown = f === 'all' ? list : f === 'open' ? open : done;
  const minimal = settings.minimalDate === today;
  return (
    <section className="card fade-in min-w-0 !p-0" aria-label="Мои задачи на сегодня">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="h2 text-[16px]">Мои задачи на сегодня</h2>
        <button className="btn btn-primary btn-sm !min-h-9 !px-3.5" onClick={() => openTask({ date: today })}><Plus size={16} />Добавить задачу</button>
      </div>
      <div className="px-4 pt-3 sm:px-5">
        <Tabs label="Фильтр задач" value={f} onChange={setF}
          items={[['all', `Все ${list.length}`], ['open', `В работе ${open.length}`], ['done', `Завершено ${done.length}`]]} />
      </div>
      <div className="px-2 pb-3 pt-2 sm:px-3">
        {shown.length ? (
          <ul className="grid">{shown.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>
        ) : list.length ? (
          <p className="px-3 py-8 text-center text-sm text-muted">{f === 'done' ? 'Пока ничего не завершено — начните с ближайшей задачи.' : 'Все задачи завершены. Отличная работа!'}</p>
        ) : (
          <div className="p-2"><Empty icon={<CalendarPlus size={26} />} title="На сегодня задач нет" text="Добавьте задачу или запланируйте повторяющееся занятие."
            action={<button className="btn btn-primary" onClick={() => openTask({ date: today })}><Plus size={18} />Добавить задачу</button>} /></div>
        )}
      </div>
      {!minimal && list.length > 3 && (
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <button className="flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-accent" onClick={() => saveSettings({ minimalDate: today })}>
            <Feather size={15} />Тяжёлый день? Оставить только главное
          </button>
        </div>
      )}
    </section>
  );
}

function NextUp({ list }: { list: Instance[] }) {
  const { today, nowMin, timer } = useData();
  const { toast } = useUI();
  const nav = useNavigate();
  const timed = nextUp(list, today, nowMin);
  const next = timed ?? list.find((i) => i.status === 'planned' && !i.startTime);
  async function start(i: Instance) {
    if (timer) { nav('/focus'); return; }
    try {
      await startTimer({ mode: 'free', label: i.title, taskId: i.task.id, occKey: i.key, areaId: i.task.studyAreaId });
      nav('/focus');
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  let status = '';
  if (next) {
    const s = parseTime(next.startTime);
    if (s === null) status = `${fmtMinutes(next.durationMin)} · время не назначено`;
    else if (s > nowMin) status = `Начало через ${fmtMinutes(s - nowMin)}`;
    else status = `Идёт · осталось ${fmtMinutes(Math.max(0, s + next.durationMin - nowMin))}`;
  }
  return (
    <section className="card fade-in" aria-label="Ближайшее занятие">
      <SectionHeader title="Ближайшее занятие" />
      {timer ? (
        <div className="flex items-center gap-3">
          <IconBadge size={46}><Timer size={22} /></IconBadge>
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{timer.label}</p><p className="text-[13px] text-muted">{timer.runningSince ? 'Сеанс концентрации идёт' : 'Сеанс на паузе'}</p></div>
          <button className="btn btn-primary" onClick={() => nav('/focus')}>Открыть</button>
        </div>
      ) : next ? (
        <>
          <div className="flex items-center gap-3">
            <IconBadge size={46}><BookOpen size={22} /></IconBadge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold">{next.title}</p>
              <p className="text-[13px] font-medium text-muted tabular-nums">
                {next.startTime ? `${showTime(parseTime(next.startTime) as number)} – ${showTime((parseTime(next.startTime) as number) + next.durationMin)} (${fmtMinutes(next.durationMin)})` : `${fmtMinutes(next.durationMin)}`}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button className="btn btn-deep" onClick={() => start(next)}><Play size={16} />Начать занятие</button>
            <span className="text-[12.5px] font-semibold text-muted">{status}</span>
          </div>
        </>
      ) : (
        <p className="py-3 text-sm text-muted">{list.length ? 'На сегодня больше нет запланированных занятий.' : 'Добавьте задачу со временем начала — она появится здесь.'}</p>
      )}
    </section>
  );
}

function TopThree({ list }: { list: Instance[] }) {
  const top = topThree(list);
  if (!top.length) return null;
  return (
    <section className="card fade-in" aria-label="Три важнейшие задачи дня">
      <SectionHeader title="Три важнейшие задачи дня" />
      <ol className="grid gap-2">
        {top.map((i, n) => (
          <li key={i.key} className="flex items-center gap-3 rounded-xl bg-card-2 px-2 py-1.5">
            <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold ${n === 0 ? 'bg-gold-soft text-[#8a6d35] dark:text-gold' : 'bg-soft text-muted'}`}>{n + 1}</span>
            <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${i.status === 'done' ? 'text-muted line-through' : ''}`}>{i.title}</span>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted">{fmtMinutes(i.durationMin)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Правая панель ---------- */
function WeekLegend() {
  const c = useThemeColors();
  return <ChartLegend items={[['Выполнено', c.accent], ['Частично', c.gold], ['Пропущено', c.danger], ['Осталось', c.muted]]} />;
}

function SidePanel() {
  const { today, settings } = useData();
  return (
    <>
      <section className="card fade-in" aria-label="Календарь"><MiniCalendar /></section>
      <section className="card fade-in" aria-label="Мой прогресс за неделю">
        <SectionHeader title="Мой прогресс" action={<Link to="/stats" className="link">Неделя</Link>} />
        <WeekChart from={startOfWeek(today, settings.weekStart)} height={160} />
        <WeekLegend />
      </section>
      <StudyCard />
    </>
  );
}

function AreaRow({ a }: { a: StudyArea }) {
  const { sessions, today, settings } = useData();
  const p = areaProgress(a, sessions, today, settings.weekStart, settings.timeZone);
  const u = AREA_UNITS[a.unit].short;
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: a.color }} aria-hidden><GraduationCap size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold">{a.name}</span>
          <span className="shrink-0 text-[12px] font-bold tabular-nums">{Math.round(Math.min(1, p.pctToday) * 100)}%</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ProgressBar value={p.pctToday} size="sm" color={a.color} label={a.name} />
        </div>
        <p className="mt-0.5 text-[11px] text-muted tabular-nums">{num(p.doneToday)} / {num(p.targetToday)} {u} сегодня</p>
      </div>
    </li>
  );
}

function StudyCard() {
  const { areas } = useData();
  const list = areas.filter((a) => a.dailyTarget > 0).slice(0, 6);
  return (
    <section className="card fade-in" aria-label="Учебные направления">
      <SectionHeader title="Учебные направления" action={<Link to="/study" className="link">Все</Link>} />
      {list.length ? <ul className="grid gap-3.5">{list.map((a) => <AreaRow key={a.id} a={a} />)}</ul>
        : <p className="text-sm text-muted">Направлений пока нет. <Link to="/study" className="link">Добавить</Link></p>}
    </section>
  );
}

/* ---------- Первый запуск ---------- */
function Welcome() {
  const { today } = useData();
  const { toast } = useUI();
  const { openTask } = useQuickAdd();
  async function demo() {
    try {
      const n = await seedDemoPlan(today);
      toast(n ? `Добавлен учебный план: ${n} направлений` : 'Демо-план уже добавлен');
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  const steps = [
    { icon: <ListChecks size={20} />, t: 'Запланируйте день', x: 'Создайте задачу — например, «Арабский язык — 60 минут».' },
    { icon: <Timer size={20} />, t: 'Занимайтесь в фокусе', x: 'Таймер сохраняет реальное время и учитывает его в прогрессе.' },
    { icon: <Sparkles size={20} />, t: 'Смотрите прогресс', x: 'Статистика строится только по вашим сохранённым данным.' },
  ];
  return (
    <section className="card fade-in grid gap-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Добро пожаловать в НИЗАМ</h2>
        <p className="muted mt-1">Начните с одной задачи — или установите пример учебного плана и настройте его под себя.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded-2xl bg-card-2 p-4 ring-1 ring-line">
            <IconBadge size={40}>{s.icon}</IconBadge>
            <p className="mt-3 font-bold">{s.t}</p>
            <p className="mt-0.5 text-[13px] text-muted">{s.x}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => openTask({ date: today })}><Plus size={18} />Создать задачу</button>
        <button className="btn btn-outline" onClick={demo}><ListChecks size={18} />Установить пример плана</button>
        <Link to="/settings" className="btn btn-ghost"><Download size={18} />Восстановить из копии</Link>
      </div>
      <p className="text-xs text-muted">Пример плана (Коран, арабский язык, перевод, программирование и др.) — редактируемый образец, а не обязательные нормы. Время занятий не назначается автоматически.</p>
    </section>
  );
}
