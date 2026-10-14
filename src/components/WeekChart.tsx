// Недельный график вынесен отдельно: Recharts загружается лениво и не утяжеляет первый экран.
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ISODate } from '../db/schema';
import { addDays, fmtWeekdayShort } from '../lib/dates';
import { dayStats } from '../lib/stats';
import { useData, useInstances } from '../state/data';
import { chartTooltip, useThemeColors } from './charts';

/** Столбцы по дням недели: выполнено / частично / пропущено (включая просроченные прошедших дней). */
export default function WeekChart({ from, height = 170 }: { from: ISODate; height?: number }) {
  const { today, nowMin, sessions } = useData();
  const to = addDays(from, 6);
  const insts = useInstances(from, to);
  const c = useThemeColors();
  const data = useMemo(() => dayStats(from, to, insts, sessions, today, nowMin).map((d) => ({
    name: fmtWeekdayShort(d.date),
    Выполнено: d.done,
    Частично: d.partial,
    Пропущено: d.skipped + d.overdue,
    Осталось: d.date >= today ? d.pending : 0,
  })), [from, to, insts, sessions, today, nowMin]);
  const empty = data.every((d) => !d.Выполнено && !d.Частично && !d.Пропущено && !d.Осталось);
  if (empty) return <p className="grid place-items-center rounded-xl bg-soft text-center text-sm text-muted" style={{ height }}>За эту неделю задач пока нет</p>;
  return (
    <div style={{ height }} role="img" aria-label="График выполнения задач по дням недели">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 0, top: 6, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={22} />
          <Tooltip {...chartTooltip(c)} />
          <Bar dataKey="Выполнено" stackId="a" fill={c.accent} isAnimationActive={false} />
          <Bar dataKey="Частично" stackId="a" fill={c.gold} isAnimationActive={false} />
          <Bar dataKey="Пропущено" stackId="a" fill={c.danger} fillOpacity={0.75} isAnimationActive={false} />
          <Bar dataKey="Осталось" stackId="a" fill={c.muted} fillOpacity={0.22} radius={[5, 5, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

