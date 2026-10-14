import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, Lightbulb } from 'lucide-react';
import { chartTooltip, ChartLegend, useThemeColors } from '../components/charts';
import { Empty, PageHeader, ProgressBar, SectionHeader, Stat, Tabs } from '../components/ui';
import { addDays, fmtDate, fmtMinutes, fmtShort, startOfWeek, WEEKDAY_NAMES } from '../lib/dates';
import { AREA_UNITS, categoryColor, num, pct, SKIP_REASONS } from '../lib/labels';
import { areaDone, areaTargetFor } from '../lib/progress';
import { weeklyRecommendations } from '../lib/recommend';
import { dayStats, minutesByWeekday, postponedRanking, skipReasonCounts, summarize } from '../lib/stats';
import { habitStats, logsMap } from '../lib/streaks';
import { dateRange, isoFromMs } from '../lib/dates';
import { useData, useInstances } from '../state/data';

import { t as T } from '../i18n';
export default function Stats() {
  const { today, nowMin, sessions, areas, habits, habitLogs, settings, occurrences, tasks } = useData();
  const [span, setSpan] = useState<'1' | '7' | '30'>('7');
  const n = Number(span);
  const from = addDays(today, -(n - 1));
  const insts = useInstances(addDays(startOfWeek(today, settings.weekStart), -7) < from ? addDays(startOfWeek(today, settings.weekStart), -7) : from, today);
  const c = useThemeColors();

  const days = useMemo(() => dayStats(from, today, insts, sessions, today, nowMin), [from, today, insts, sessions, nowMin]);
  const sum = summarize(days);
  const thisWeekFrom = startOfWeek(today, settings.weekStart);
  const prevFrom = addDays(thisWeekFrom, -7);
  const thisWeek = summarize(dayStats(thisWeekFrom, today, insts, sessions, today, nowMin));
  const prevWeek = summarize(dayStats(prevFrom, addDays(thisWeekFrom, -1), insts, sessions, today, nowMin));
  const postponed = postponedRanking(insts.filter((i) => i.date >= from), today, nowMin);

  const norms = useMemo(() => {
    let met = 0, total = 0;
    for (const a of areas) {
      if (a.dailyTarget <= 0) continue;
      const created = isoFromMs(a.createdAt, settings.timeZone);
      for (const d of dateRange(from, today)) {
        if (d < created || d === today) continue;
        total++;
        if (areaDone(a, sessions, d, d) >= areaTargetFor(a, d)) met++;
      }
    }
    return { met, total };
  }, [areas, sessions, from, today, settings.timeZone]);

  const habitRank = habits.filter((h) => !h.archived)
    .map((h) => ({ h, s: habitStats(h, logsMap(habitLogs, h.id), today, settings.weekStart, n) }))
    .sort((a, b) => b.s.rate - a.s.rate || b.s.current - a.s.current);

  const chart = days.map((d) => ({ name: n === 7 ? fmtDate(d.date, { weekday: 'short' }) : fmtShort(d.date), Запланировано: d.planned, Выполнено: d.done, Частично: d.partial, Пропущено: d.skipped + d.overdue, Минуты: d.actualMin }));
  const hasData = sum.planned > 0 || sum.actualMin > 0 || habitLogs.length > 0;
  const tooltip = chartTooltip(c);

  // Время по категориям: категория связанной задачи, иначе — название направления.
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    for (const ss of sessions) {
      if (ss.date < from || ss.date > today || ss.minutes <= 0) continue;
      const t = ss.taskId ? taskMap.get(ss.taskId) : undefined;
      const key = t?.category ?? areas.find((a) => a.id === ss.areaId)?.name ?? T('Без категории');
      m.set(key, (m.get(key) ?? 0) + ss.minutes);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [sessions, tasks, areas, from, today]);
  const catTotal = byCategory.reduce((a, x) => a + x.value, 0);
  const reasons = skipReasonCounts(occurrences, from, today);
  const maxReason = Math.max(1, ...reasons.map((r) => r[1]));
  const byWd = minutesByWeekday(dayStats(addDays(today, -27), today, insts, sessions, today, nowMin));

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title={T('Статистика')} subtitle={T('Все показатели рассчитаны по вашим сохранённым данным — без выдуманных цифр.')} actions={<Tabs label={T('Период')} value={span} onChange={setSpan} items={[['1', T('День')], ['7', T('Неделя')], ['30', T('Месяц')]]} />} />
      {!hasData ? (
        <Empty icon={<ChartColumn size={28} />} title={T('Пока нет данных')} text={T('Отмечайте выполнение задач, записывайте занятия и привычки — здесь появятся графики.')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={T('Продуктивность')} value={pct(sum.progress)} sub={T('выполнено {0} из {1}', sum.done, sum.planned)} />
            <Stat label={T('Пропущено')} value={sum.skipped + sum.overdue} sub={sum.partial ? T('частично: {0}', sum.partial) : T('задач за период')} />
            <Stat label={T('Продуктивное время')} value={fmtMinutes(sum.actualMin)} sub={T('план: {0}', fmtMinutes(sum.plannedMin))} />
            <Stat label={T('Дневные нормы')} value={norms.total ? pct(norms.met / norms.total) : '—'} sub={norms.total ? T('{0} из {1} (без сегодня)', norms.met, norms.total) : areas.some((a) => a.dailyTarget > 0) ? T('появятся после первого полного дня') : T('нет направлений с нормой')} />
          </div>

          <WeeklyReport />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="card min-w-0">
              <SectionHeader title={T('Выполнение задач по дням')} />
              <div className="h-60" role="img" aria-label={T('Столбчатый график выполнения задач')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ left: 0, right: 4, top: 4 }} barCategoryGap="24%">
                    <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="Выполнено" name={T('Выполнено')} stackId="a" fill={c.accent} isAnimationActive={false} />
                    <Bar dataKey="Частично" name={T('Частично')} stackId="a" fill={c.gold} isAnimationActive={false} />
                    <Bar dataKey="Пропущено" name={T('Пропущено')} stackId="a" fill={c.danger} fillOpacity={0.75} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartLegend items={[[T('Выполнено'), c.accent], [T('Частично'), c.gold], [T('Пропущено / не завершено'), c.danger]]} />
            </section>
            <section className="card min-w-0">
              <SectionHeader title={T('Время по категориям')} />
              {!byCategory.length ? <p className="grid h-60 place-items-center text-center text-sm text-muted">{T('За период время не записано')}</p> : (
                <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-4">
                  <div className="relative h-[150px]" role="img" aria-label={T('Кольцевая диаграмма времени по категориям')}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none" isAnimationActive={false}>
                          {byCategory.map((e) => <Cell key={e.name} fill={categoryColor(e.name)} />)}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(v) => fmtMinutes(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[15px] font-extrabold tabular-nums">{fmtMinutes(catTotal)}</p><p className="text-[10px] text-muted">{T('всего')}</p></div></div>
                  </div>
                  <ul className="grid gap-1.5 text-[13px]">
                    {byCategory.slice(0, 6).map((e) => (
                      <li key={e.name} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryColor(e.name) }} /><span className="min-w-0 flex-1 truncate">{T(e.name)}</span><span className="shrink-0 font-semibold tabular-nums">{Math.round((e.value / catTotal) * 100)}%</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <section className="card min-w-0">
            <SectionHeader title={T('Время занятий, мин')} />
            <div className="h-52" role="img" aria-label={T('Линейный график времени занятий')}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: 0, right: 8, top: 4 }}>
                  <defs><linearGradient id="minFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.accent} stopOpacity={0.28} /><stop offset="1" stopColor={c.accent} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="3 4" />
                  <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip {...tooltip} />
                  <Area type="monotone" dataKey="Минуты" name={T('Минуты')} stroke={c.accent} strokeWidth={2.5} fill="url(#minFill)" dot={{ r: 3, fill: c.accent }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <ActivityHeatmap />

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <SectionHeader title={T('Самые продуктивные дни недели')} />
              <p className="-mt-2 mb-3 text-[12px] text-muted">{T('По записанному времени за последние 4 недели')}</p>
              <ul className="grid gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((w) => {
                  const max = Math.max(1, ...byWd);
                  return (
                    <li key={w} className="grid grid-cols-[28px_minmax(0,1fr)_64px] items-center gap-2 text-[13px]">
                      <span className="font-semibold text-muted">{WEEKDAY_NAMES[w]}</span>
                      <ProgressBar value={byWd[w] / max} size="sm" tone={byWd[w] === max && byWd[w] > 0 ? 'gold' : 'brand'} label={WEEKDAY_NAMES[w]} />
                      <span className="text-end tabular-nums text-muted">{fmtMinutes(byWd[w])}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="card">
              <SectionHeader title={T('Причины пропусков')} />
              {!reasons.length ? <p className="text-sm text-muted">{T('За период пропусков с указанной причиной нет.')}</p> : (
                <ul className="grid gap-2.5">
                  {reasons.map(([r, k]) => (
                    <li key={r} className="text-[13px]">
                      <div className="mb-1 flex justify-between gap-2"><span>{SKIP_REASONS[r]}</span><span className="font-semibold tabular-nums">{k}</span></div>
                      <ProgressBar value={k / maxReason} size="sm" tone="warn" label={SKIP_REASONS[r]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="h2 mb-3">{T('Эта неделя и прошлая')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:pe-3 [&_th]:pe-3">
                <thead className="text-start text-xs text-muted"><tr><th className="py-1 font-medium">{T('Показатель')}</th><th className="font-medium">{T('Эта')}</th><th className="font-medium">{T('Прошлая')}</th><th className="font-medium">{T('Изменение')}</th></tr></thead>
                <tbody className="tabular-nums">
                  {([
                    [T('Выполнено задач'), thisWeek.done, prevWeek.done, (v: number) => String(v)],
                    [T('Процент выполнения'), thisWeek.doneRate, prevWeek.doneRate, pct],
                    [T('Продуктивное время'), thisWeek.actualMin, prevWeek.actualMin, fmtMinutes],
                    [T('Пропущено'), thisWeek.skipped, prevWeek.skipped, (v: number) => String(v)],
                  ] as [string, number, number, (v: number) => string][]).map(([l, a, b, f]) => {
                    const diff = a - b;
                    return (
                      <tr key={l} className="border-t border-line">
                        <td className="py-2">{l}</td><td>{f(a)}</td><td className="text-muted">{f(b)}</td>
                        <td className={diff > 0 ? (l === T('Пропущено') ? 'text-danger' : 'text-ok') : diff < 0 ? (l === T('Пропущено') ? 'text-ok' : 'text-danger') : 'text-muted'}>
                          {diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} {diff !== 0 && f(Math.abs(diff))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{T('Эта неделя — с')}{' '}{fmtShort(thisWeekFrom)}{' '}{T('по сегодня.')}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="h2 mb-3">{T('Прогресс по направлениям')}</h2>
              {!areas.length ? <p className="muted">{T('Направлений нет.')}</p> : (
                <ul className="grid gap-3">
                  {areas.map((a) => {
                    const v = areaDone(a, sessions, from, today);
                    const target = a.dailyTarget * n;
                    return (
                      <li key={a.id}>
                        <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{a.name}</span><span className="tabular-nums text-muted">{num(v)} / {num(target)} {AREA_UNITS[a.unit].short}</span></div>
                        <ProgressBar value={target ? v / target : 0} size="sm" label={a.name} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="card">
              <h2 className="h2 mb-3">{T('Самые стабильные привычки')}</h2>
              {!habitRank.length ? <p className="muted">{T('Привычек нет.')}</p> : (
                <ol className="grid gap-2 text-sm">
                  {habitRank.slice(0, 6).map(({ h, s }) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">{pct(s.rate)}{' '}{T('· серия')}{' '}{s.current} {s.unit}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="h2 mb-3">{T('Чаще всего откладываемые занятия')}</h2>
            {!postponed.length ? <p className="muted">{T('За период нет пропусков, просрочек или переносов.')}</p> : (
              <ul className="grid gap-2 text-sm">
                {postponed.map((p) => (
                  <li key={p.title} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.title}</span>
                    <span className="text-xs text-muted">{T('пропущено')}{' '}{p.skipped}{' '}{T('· просрочено')}{' '}{p.overdue}{' '}{T('· перенесено')}{' '}{p.moved}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Календарь активности: последние 18 недель, насыщенность — записанное время за день. */
function ActivityHeatmap() {
  const { today, sessions, settings } = useData();
  const weeks = 18;
  const start = addDays(startOfWeek(today, settings.weekStart), -7 * (weeks - 1));
  const mins = useMemo(() => {
    const m = new Map<string, number>();
    for (const ss of sessions) if (ss.date >= start && ss.date <= today) m.set(ss.date, (m.get(ss.date) ?? 0) + ss.minutes);
    return m;
  }, [sessions, start, today]);
  const max = Math.max(60, ...mins.values());
  const level = (v: number) => (v <= 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.75 ? 3 : 4);
  const shades = ['var(--soft)', 'color-mix(in srgb, var(--accent) 25%, var(--soft))', 'color-mix(in srgb, var(--accent) 50%, var(--soft))', 'color-mix(in srgb, var(--accent) 75%, var(--soft))', 'var(--accent)'];
  const total = [...mins.values()].reduce((a, b) => a + b, 0);
  const activeDays = [...mins.values()].filter((v) => v > 0).length;
  return (
    <section className="card min-w-0">
      <SectionHeader title={T('Календарь активности')} action={<span className="text-[12px] text-muted">{activeDays}{' '}{T('акт. дней ·')}{' '}{fmtMinutes(total)}</span>} />
      <div className="thin-scroll overflow-x-auto pb-1">
        <div className="flex gap-[3px]" role="img" aria-label={T('Активность за {0} недель: {1} дней с занятиями', weeks, activeDays)}>
          {Array.from({ length: weeks }, (_, w) => (
            <div key={w} className="grid gap-[3px]">
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDays(start, w * 7 + d);
                const v = mins.get(date) ?? 0;
                return <span key={d} title={`${fmtShort(date)}: ${fmtMinutes(v)}`} className={`block size-[14px] rounded-[4px] ${date > today ? 'opacity-0' : ''} ${date === today ? 'ring-1 ring-fg/40' : ''}`} style={{ background: shades[level(v)] }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">{T('меньше')}{' '}{shades.map((sh, i) => <span key={i} className="size-[11px] rounded-[3px]" style={{ background: sh }} />)}{' '}{T('больше')}</div>
    </section>
  );
}

/** Краткий недельный отчёт: выводы простыми правилами по данным текущей недели. */
function WeeklyReport() {
  const { today, nowMin, sessions, occurrences, settings } = useData();
  const from = startOfWeek(today, settings.weekStart);
  const prevFrom = addDays(from, -7);
  const insts = useInstances(prevFrom, today);
  const days = useMemo(() => dayStats(from, today, insts, sessions, today, nowMin), [from, today, insts, sessions, nowMin]);
  const prevDays = useMemo(() => dayStats(prevFrom, addDays(from, -1), insts, sessions, today, nowMin), [prevFrom, from, insts, sessions, today, nowMin]);
  const sum = summarize(days), prev = summarize(prevDays);
  const recs = weeklyRecommendations({
    days, prevDays, reasons: skipReasonCounts(occurrences, from, today),
    postponed: postponedRanking(insts.filter((i) => i.date >= from), today, nowMin), byWeekday: minutesByWeekday(days),
  });
  const best = [...days].sort((a, b) => b.actualMin - a.actualMin)[0];
  const diff = sum.actualMin - prev.actualMin;
  return (
    <section className="card grid gap-3 border-gold/30 bg-gradient-to-br from-gold-soft/60 to-card">
      <SectionHeader icon={<Lightbulb size={18} className="text-gold" />} title={T('Отчёт за неделю')} action={<Link to="/review" className="link">{T('Подробнее')}</Link>} />
      <ul className="grid gap-1.5 text-[14px]">
        <li>{T('Занятия:')}{' '}<b className="tabular-nums">{fmtMinutes(sum.actualMin)}</b>{prev.actualMin > 0 && <span className={diff >= 0 ? 'text-ok' : 'text-danger'}> ({diff >= 0 ? '+' : '−'}{fmtMinutes(Math.abs(diff))}{' '}{T('к прошлой неделе)')}</span>}</li>
        <li>{T('Задачи: выполнено')}{' '}<b className="tabular-nums">{sum.done}</b>{' '}{T('из')}{' '}{sum.planned}{sum.planned ? ` (${pct(sum.doneRate)})` : ''}{sum.skipped + sum.overdue ? T(', не выполнено {0}', sum.skipped + sum.overdue) : ''}</li>
        {best && best.actualMin > 0 && <li>{T('Лучший день:')}{' '}<b>{fmtDate(best.date, { weekday: 'long' })}</b> — {fmtMinutes(best.actualMin)}</li>}
      </ul>
      {recs.length > 0 && (
        <div className="grid gap-1.5">
          {recs.slice(0, 2).map((r, i) => <p key={i} className="rounded-xl bg-card px-3 py-2 text-[13px] ring-1 ring-line">{r.text} <span className="text-muted">— {r.why}</span></p>)}
        </div>
      )}
    </section>
  );
}
