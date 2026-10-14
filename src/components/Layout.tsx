import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen, CalendarDays, ChartColumn, Ellipsis, Flame, GraduationCap, LayoutDashboard, LifeBuoy, NotebookPen, Settings, Target, Timer,
} from 'lucide-react';
import { useData, useNow } from '../state/data';
import { fmtClock } from '../lib/dates';
import { timerElapsed } from '../db/repo';
import { Modal } from './ui';

export const NAV = [
  { to: '/', label: 'Главная', icon: LayoutDashboard },
  { to: '/plan', label: 'План', icon: CalendarDays },
  { to: '/focus', label: 'Фокус', icon: Timer },
  { to: '/habits', label: 'Привычки', icon: Flame },
  { to: '/study', label: 'Обучение', icon: GraduationCap },
  { to: '/goals', label: 'Цели', icon: Target },
  { to: '/recovery', label: 'Восстановление', icon: LifeBuoy },
  { to: '/stats', label: 'Статистика', icon: ChartColumn },
  { to: '/review', label: 'Обзор дня', icon: NotebookPen },
  { to: '/faith', label: 'Поклонение', icon: BookOpen },
  { to: '/settings', label: 'Настройки', icon: Settings },
];
const MOBILE = ['/', '/plan', '/focus', '/study'];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="./icon.svg" alt="" className="size-9 rounded-xl" />
      <div className="leading-tight">
        <p className="font-semibold tracking-wide">НИЗАМ <span className="arabic text-accent" lang="ar">نِظَام</span></p>
        <p className="text-[11px] text-muted">Порядок · Дисциплина · Развитие</p>
      </div>
    </div>
  );
}

function TimerPill() {
  const { timer } = useData();
  const now = useNow(!!timer?.runningSince);
  if (!timer) return null;
  return (
    <NavLink to="/focus" className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
      <Timer size={16} />
      <span className="truncate">{timer.phase === 'break' ? 'Отдых' : timer.runningSince ? 'Идёт сеанс' : 'Пауза'}</span>
      <span className="ml-auto tabular-nums">{fmtClock(timerElapsed(timer, Math.max(now, timer.runningSince ?? 0)))}</span>
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const moreActive = !MOBILE.includes(loc.pathname);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 btn btn-primary">К содержанию</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 border-r border-line bg-card px-3 py-5 md:flex" aria-label="Главное меню">
        <Brand />
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-soft hover:text-fg'}`}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </nav>
        <TimerPill />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Brand />
      </header>

      <main id="main" className="md:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</div>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden" aria-label="Нижнее меню">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-muted'}`}>
              <Icon size={20} />{label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${moreActive ? 'text-accent' : 'text-muted'}`} aria-haspopup="dialog">
            <Ellipsis size={20} />Ещё
          </button>
        </div>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Разделы">
        <div className="mb-3"><TimerPill /></div>
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !MOBILE.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)}
              className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium ${isActive ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
              <Icon size={20} />{label}
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
}
