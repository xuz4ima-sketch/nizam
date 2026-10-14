import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, History as HistoryIcon } from 'lucide-react';
import { TaskItem } from '../components/TaskItem';
import { Empty, PageHeader, Ring, Tabs } from '../components/ui';
import { addDays, fmtDate, fmtMinutes, showTime, zonedParts } from '../lib/dates';
import { dayStats } from '../lib/stats';
import { useData, useInstances } from '../state/data';

export default function HistoryPage() {
  const { today, nowMin, sessions, tasks, areas, settings } = useData();
  const [span, setSpan] = useState<'7' | '30' | '90'>('30');
  const from = addDays(today, -(Number(span) - 1));
  const insts = useInstances(from, today);
  const days = useMemo(() => dayStats(from, today, insts, sessions, today, nowMin).filter((d) => d.planned || d.actualMin).reverse(), [from, today, insts, sessions, nowMin]);
  const [open, setOpen] = useState<string | null>(today);

  return (
    <div className="fade-in">
      <PageHeader title="История" subtitle="Что было запланировано, выполнено и пропущено — по сохранённым данным."
        actions={<Tabs label="Период" value={span} onChange={setSpan} items={[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней']]} />} />
      {!days.length ? (
        <Empty icon={<HistoryIcon size={26} />} title="История пока пуста" text="Отмечайте выполнение задач и записывайте занятия — дни появятся здесь." />
      ) : (
        <ul className="grid gap-2.5">
          {days.map((d) => {
            const isOpen = open === d.date;
            const list = insts.filter((i) => i.date === d.date);
            const daySessions = sessions.filter((s) => s.date === d.date && s.source !== 'task').sort((a, b) => a.startedAt - b.startedAt);
            return (
              <li key={d.date} className="card !p-0">
                <button className="flex w-full items-center gap-3.5 p-4 text-left" onClick={() => setOpen(isOpen ? null : d.date)} aria-expanded={isOpen}>
                  <Ring value={d.progress} size={46} stroke={5}><span className="text-[11px] font-extrabold tabular-nums">{Math.round(d.progress * 100)}%</span></Ring>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}{d.date === today && <span className="ml-2 chip !bg-accent-soft !text-accent">сегодня</span>}</p>
                    <p className="text-[12.5px] text-muted">
                      выполнено {d.done} из {d.planned}{d.partial ? ` · частично ${d.partial}` : ''}{d.skipped ? ` · пропущено ${d.skipped}` : ''}{d.overdue ? ` · не завершено ${d.overdue}` : ''} · {fmtMinutes(d.actualMin)}
                    </p>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="fade border-t border-line px-2 pb-3 pt-2">
                    {list.length > 0 && <ul className="grid">{list.map((i) => <TaskItem key={i.key} inst={i} />)}</ul>}
                    {daySessions.length > 0 && (
                      <div className="px-2.5 pt-3">
                        <p className="eyebrow mb-1.5">Записанные занятия</p>
                        <ul className="grid gap-1 text-[13px]">
                          {daySessions.map((s) => (
                            <li key={s.id} className="flex justify-between gap-3">
                              <span className="truncate">{tasks.find((t) => t.id === s.taskId)?.title ?? areas.find((a) => a.id === s.areaId)?.name ?? s.note ?? 'Сосредоточенная работа'}
                                <span className="text-muted"> · {s.source === 'timer' ? 'таймер' : 'вручную'} · {showTime(zonedParts(s.startedAt, settings.timeZone).minutes)}</span></span>
                              <span className="shrink-0 font-semibold tabular-nums">{fmtMinutes(s.minutes)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!list.length && !daySessions.length && <p className="px-3 py-4 text-sm text-muted">Нет записей.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-[12px] text-muted">Рефлексия дня и итоги недели — в разделе <Link to="/review" className="link">Обзор дня</Link>.</p>
    </div>
  );
}
