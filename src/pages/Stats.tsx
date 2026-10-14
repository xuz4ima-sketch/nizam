import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn } from 'lucide-react';
import { Empty, PageHeader, ProgressBar, Stat, Tabs } from '../components/ui';
import { addDays, fmtMinutes, fmtShort, startOfWeek } from '../lib/dates';
import { AREA_UNITS, num, pct } from '../lib/labels';
import { areaDone, areaTargetFor } from '../lib/progress';
import { dayStats, postponedRanking, summarize } from '../lib/stats';
import { habitStats, logsMap } from '../lib/streaks';
import { dateRange, isoFromMs } from '../lib/dates';
import { useData, useInstances } from '../state/data';

function useColors() {
  const { settings } = useData();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { accent: v('--accent'), muted: v('--muted'), grid: v('--border'), card: v('--card'), text: v('--text'), soft: v('--soft') };
  }, [settings.theme]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Stats() {
  const { today, nowMin, sessions, areas, habits, habitLogs, settings } = useData();
  const [span, setSpan] = useState<'7' | '30'>('7');
  const n = Number(span);
  const from = addDays(today, -(n - 1));
  const insts = useInstances(addDays(startOfWeek(today, settings.weekStart), -7) < from ? addDays(startOfWeek(today, settings.weekStart), -7) : from, today);
  const c = useColors();

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

  const chart = days.map((d) => ({ name: fmtShort(d.date), Запланировано: d.planned, Выполнено: d.done, Минуты: d.actualMin }));
  const hasData = sum.planned > 0 || sum.actualMin > 0 || habitLogs.length > 0;
  const tooltip = { contentStyle: { background: c.card, border: `1px solid ${c.grid}`, borderRadius: 12, color: c.text }, cursor: { fill: c.soft } };

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title="Статистика" subtitle="Только реальные сохранённые данные." actions={<Tabs label="Период" value={span} onChange={setSpan} items={[['7', '7 дней'], ['30', '30 дней']]} />} />
      {!hasData ? (
        <Empty icon={<ChartColumn size={28} />} title="Пока нет данных" text="Отмечайте выполнение задач, записывайте занятия и привычки — здесь появятся графики." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Выполнено задач" value={pct(sum.doneRate)} sub={`${sum.done} из ${sum.planned}`} />
            <Stat label="Общий прогресс" value={pct(sum.progress)} sub="с учётом частичного" />
            <Stat label="Продуктивное время" value={fmtMinutes(sum.actualMin)} sub={`план: ${fmtMinutes(sum.plannedMin)}`} />
            <Stat label="Дневные нормы" value={norms.total ? pct(norms.met / norms.total) : '—'} sub={norms.total ? `${norms.met} из ${norms.total} (без сегодня)` : 'нет направлений'} />
          </div>

          <section className="card">
            <h2 className="h2 mb-3">Запланировано и выполнено</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Запланировано" fill={c.muted} fillOpacity={0.3} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Выполнено" fill={c.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Время продуктивной работы, мин</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ left: -20, right: 8, top: 4 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltip} />
                  <Line type="monotone" dataKey="Минуты" stroke={c.accent} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Эта неделя и прошлая</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:pr-3 [&_th]:pr-3">
                <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Показатель</th><th className="font-medium">Эта</th><th className="font-medium">Прошлая</th><th className="font-medium">Изменение</th></tr></thead>
                <tbody className="tabular-nums">
                  {([
                    ['Выполнено задач', thisWeek.done, prevWeek.done, (v: number) => String(v)],
                    ['Процент выполнения', thisWeek.doneRate, prevWeek.doneRate, pct],
                    ['Продуктивное время', thisWeek.actualMin, prevWeek.actualMin, fmtMinutes],
                    ['Пропущено', thisWeek.skipped, prevWeek.skipped, (v: number) => String(v)],
                  ] as [string, number, number, (v: number) => string][]).map(([l, a, b, f]) => {
                    const diff = a - b;
                    return (
                      <tr key={l} className="border-t border-line">
                        <td className="py-2">{l}</td><td>{f(a)}</td><td className="text-muted">{f(b)}</td>
                        <td className={diff > 0 ? (l === 'Пропущено' ? 'text-danger' : 'text-ok') : diff < 0 ? (l === 'Пропущено' ? 'text-ok' : 'text-danger') : 'text-muted'}>
                          {diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} {diff !== 0 && f(Math.abs(diff))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Эта неделя — с {fmtShort(thisWeekFrom)} по сегодня.</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="h2 mb-3">Прогресс по направлениям</h2>
              {!areas.length ? <p className="muted">Направлений нет.</p> : (
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
              <h2 className="h2 mb-3">Самые стабильные привычки</h2>
              {!habitRank.length ? <p className="muted">Привычек нет.</p> : (
                <ol className="grid gap-2 text-sm">
                  {habitRank.slice(0, 6).map(({ h, s }) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">{pct(s.rate)} · серия {s.current} {s.unit}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="h2 mb-3">Чаще всего откладываемые занятия</h2>
            {!postponed.length ? <p className="muted">За период нет пропусков, просрочек или переносов.</p> : (
              <ul className="grid gap-2 text-sm">
                {postponed.map((p) => (
                  <li key={p.title} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.title}</span>
                    <span className="text-xs text-muted">пропущено {p.skipped} · просрочено {p.overdue} · перенесено {p.moved}</span>
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
