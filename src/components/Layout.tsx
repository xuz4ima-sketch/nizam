import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BookOpen, BookOpenText, Check, Languages, CalendarDays, ChartColumn, ChevronRight, ClipboardList, Download, Ellipsis, Flame, GraduationCap, History,
  House, Library, LifeBuoy, ListChecks, Moon, NotebookPen, Plus, ScrollText, Search, Settings, Sun, Target, Timer, UserRound, X,
} from 'lucide-react';
import { useData, useInstances, useNow } from '../state/data';
import { fmtClock, fmtShort, parseTime } from '../lib/dates';
import { saveSettings, timerElapsed } from '../db/repo';
import { buildNotices, type Notice } from '../lib/notices';
import type { Task } from '../db/schema';
import { downloadJSON, exportAll } from '../db/backup';
import { Logo, StarPattern } from './Art';
import { useIsDark } from './charts';
import { TaskForm, type TaskPreset } from './TaskForm';
import { IconBadge, errMsg, useUI } from './ui';
import { LANGS, t } from '../i18n';

import { t as T } from '../i18n';
export const NAV = [
  { to: '/', label: 'Главная', icon: House, group: 'main' },
  { to: '/tasks', label: 'Задачи', icon: ListChecks, group: 'main' },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays, group: 'main' },
  { to: '/habits', label: 'Привычки', icon: Flame, group: 'main' },
  { to: '/study', label: 'Моё обучение', icon: GraduationCap, group: 'main' },
  { to: '/goals', label: 'Цели', icon: Target, group: 'main' },
  { to: '/focus', label: 'Концентрация', icon: Timer, group: 'main' },
  { to: '/stats', label: 'Статистика', icon: ChartColumn, group: 'main' },
  { to: '/quran', label: 'Коран', icon: BookOpenText, group: 'ilm' },
  { to: '/hadith', label: 'Хадисы', icon: ScrollText, group: 'ilm' },
  { to: '/mutun', label: 'Мутуны', icon: NotebookPen, group: 'ilm' },
  { to: '/library', label: 'Книги', icon: Library, group: 'ilm' },
  { to: '/recovery', label: 'Восстановление', icon: LifeBuoy, group: 'more' },
  { to: '/history', label: 'История', icon: History, group: 'more' },
  { to: '/review', label: 'Обзор дня', icon: ClipboardList, group: 'more' },
  { to: '/faith', label: 'Поклонение', icon: BookOpen, group: 'more' },
  { to: '/settings', label: 'Настройки', icon: Settings, group: 'more' },
] as const;

const MOBILE = [
  { to: '/', label: 'Главная', icon: House },
  { to: '/tasks', label: 'Задачи', icon: ListChecks },
  { to: '/focus', label: 'Фокус', icon: Timer },
  { to: '/stats', label: 'Статистика', icon: ChartColumn },
  { to: '/more', label: 'Ещё', icon: Ellipsis },
];
export const MORE_ITEMS = ['/quran', '/hadith', '/mutun', '/library', '/habits', '/study', '/goals', '/calendar', '/history', '/recovery', '/review', '/faith', '/settings'];

/* ---------- Быстрое добавление задачи из любого места ---------- */
type TaskOpen = { date?: string; task?: Task; preset?: TaskPreset };
interface QuickAdd { openTask: (o?: TaskOpen) => void; openSearch: () => void }
const QuickCtx = createContext<QuickAdd | null>(null);
export function useQuickAdd() {
  const v = useContext(QuickCtx);
  if (!v) throw new Error(T('Layout отсутствует'));
  return v;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 rounded-xl" aria-label={T('НИЗАМ — на главную')}>
      <Logo size={compact ? 32 : 38} />
      <div className="leading-none">
        <p className="flex items-baseline gap-2 text-[17px] font-extrabold tracking-[0.12em] text-accent-strong dark:text-fg">{T('НИЗАМ')}{' '}<span className="arabic text-[19px] font-semibold tracking-normal text-gold" lang="ar">نِظَام</span>
        </p>
        {!compact && <p className="mt-1.5 whitespace-nowrap text-[10px] font-medium text-muted">{T('Порядок · Постоянство · Развитие')}</p>}
      </div>
    </NavLink>
  );
}

function TimerPill() {
  const { timer } = useData();
  const now = useNow(!!timer?.runningSince);
  if (!timer) return null;
  return (
    <NavLink to="/focus" className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent">
      <span className={`size-2 rounded-full ${timer.runningSince ? 'animate-pulse bg-accent' : 'bg-warn'}`} />
      <span className="truncate">{timer.phase === 'break' ? T('Отдых') : timer.runningSince ? T('Идёт сеанс') : T('Пауза')}</span>
      <span className="ms-auto tabular-nums">{fmtClock(timerElapsed(timer, Math.max(now, timer.runningSince ?? 0)))}</span>
    </NavLink>
  );
}

function Sidebar() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-soft hover:text-fg'}`;
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-[248px] flex-col border-e border-line bg-card lg:flex" aria-label={T('Главное меню')}>
      <div className="px-5 pb-5 pt-6"><Brand /></div>
      <nav className="thin-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV.filter((n) => n.group === 'main').map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={link}><Icon size={19} strokeWidth={1.9} />{T(label)}</NavLink>
        ))}
        <p className="eyebrow mb-1 mt-4 px-3">{t('Знание')}</p>
        {NAV.filter((n) => n.group === 'ilm').map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={link}><Icon size={19} strokeWidth={1.9} />{t(label)}</NavLink>
        ))}
        <p className="eyebrow mt-4 mb-1 px-3">{T('Ещё')}</p>
        {NAV.filter((n) => n.group === 'more').map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={link}><Icon size={19} strokeWidth={1.9} />{T(label)}</NavLink>
        ))}
      </nav>
      <div className="grid gap-3 p-3">
        <TimerPill />
        <div className="relative overflow-hidden rounded-2xl bg-brand-900 px-4 py-4 text-white">
          <StarPattern className="absolute inset-0" opacity={0.18} color="#c4a56b" size={36} />
          <p className="arabic relative text-center text-2xl text-gold" lang="ar">نِظَام</p>
          <p className="relative mt-1 text-center text-[11px] font-medium text-white/75">{T('Порядок. Постоянство. Развитие.')}</p>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Поиск ---------- */
type Hit = { id: string; title: string; sub: string; icon: ReactNode; run: () => void };

function SearchPalette({ open, onClose, onTask }: { open: boolean; onClose: () => void; onTask: (t: Task) => void }) {
  const { tasks, goals, areas, habits } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); }
    if (!open && d.open) d.close();
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    const go = (to: string) => () => { onClose(); nav(to); };
    const m = (...xs: (string | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(s));
    const pages: Hit[] = NAV.filter((n) => !s || m(T(n.label), n.label)).map((n) => ({ id: `p${n.to}`, title: T(n.label), sub: T('Раздел'), icon: <n.icon size={17} />, run: go(n.to) }));
    if (!s) return pages.slice(0, 8);
    const out: Hit[] = [];
    for (const t of tasks) if (m(t.title, t.category, t.description)) out.push({ id: `t${t.id}`, title: t.title, sub: T('Задача · {0}{1}', t.category, t.recurrence.kind === 'none' ? ` · ${fmtShort(t.date)}` : T(' · повторяется')), icon: <ListChecks size={17} />, run: () => { onClose(); onTask(t); } });
    for (const g of goals) if (m(g.title, g.note)) out.push({ id: `g${g.id}`, title: g.title, sub: T('Цель'), icon: <Target size={17} />, run: go('/goals') });
    for (const a of areas) if (m(a.name, a.description)) out.push({ id: `a${a.id}`, title: a.name, sub: T('Учебное направление'), icon: <GraduationCap size={17} />, run: go(a.faith ? '/faith' : '/study') });
    for (const h of habits) if (m(h.name)) out.push({ id: `h${h.id}`, title: h.name, sub: T('Привычка'), icon: <Flame size={17} />, run: go('/habits') });
    return [...out.slice(0, 30), ...pages];
  }, [q, tasks, goals, areas, habits, nav, onClose, onTask]);

  useEffect(() => { setSel(0); }, [q]);

  return (
    <dialog ref={ref} className="modal !mt-[8vh] !mb-auto" aria-label={T('Поиск')}
      onCancel={(e) => { e.preventDefault(); onClose(); }} onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="flex max-h-[70dvh] flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="shrink-0 text-muted" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={T('Поиск задач, целей, направлений, привычек…')}
              className="min-h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted" aria-label={T('Строка поиска')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(hits.length - 1, v + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(0, v - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); hits[sel]?.run(); }
              }} />
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={T('Закрыть поиск')}><X size={18} /></button>
          </div>
          <ul className="thin-scroll overflow-y-auto p-2" role="listbox" aria-label={T('Результаты')}>
            {q.trim() && hits.every((h) => h.sub === T('Раздел')) && <li className="px-3 py-6 text-center text-sm text-muted">{T('Ничего не найдено по запросу «')}{q.trim()}»</li>}
            {hits.map((h, i) => (
              <li key={h.id} role="option" aria-selected={i === sel}>
                <button onClick={h.run} onMouseEnter={() => setSel(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start ${i === sel ? 'bg-accent-soft' : ''}`}>
                  <span className="text-accent">{h.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.title}</span><span className="block truncate text-xs text-muted">{h.sub}</span></span>
                  <ChevronRight size={16} className="text-muted rtl:-scale-x-100" />
                </button>
              </li>
            ))}
          </ul>
          <p className="hidden border-t border-line px-4 py-2 text-[11px] text-muted sm:block">{T('↑↓ — выбор · Enter — открыть · Esc — закрыть · Ctrl+K — открыть поиск')}</p>
        </div>
      )}
    </dialog>
  );
}

/* ---------- Всплывающие панели (уведомления, профиль) ---------- */
function Popover({ open, onClose, children, label, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={label}
      className={`fade-in fixed inset-x-3 top-[calc(64px+env(safe-area-inset-top))] z-50 rounded-[20px] border border-line bg-card shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-[360px] ${className}`}>
      {children}
    </div>
  );
}

function NotificationsPanel({ notices, onClose }: { notices: Notice[]; onClose: () => void }) {
  const { settings } = useData();
  const { toast } = useUI();
  const nav = useNavigate();
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  async function toggle() {
    try {
      if (!settings.notifications) {
        if (!supported) { toast(T('Этот браузер не поддерживает уведомления'), 'error'); return; }
        if (Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { toast(T('Браузер не разрешил уведомления'), 'error'); return; }
        }
        await saveSettings({ notifications: true });
        toast(T('Уведомления включены'));
      } else { await saveSettings({ notifications: false }); toast(T('Уведомления выключены')); }
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <div className="flex max-h-[70dvh] flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="h2">{T('Уведомления')}</h2>
        <span className="text-xs text-muted">{notices.length ? T('{0} активн.', notices.length) : T('всё спокойно')}</span>
      </div>
      <ul className="thin-scroll grid gap-1 overflow-y-auto px-2">
        {!notices.length && <li className="px-3 py-6 text-center text-sm text-muted">{T('Новых уведомлений нет. Хорошего дня!')}</li>}
        {notices.map((n) => (
          <li key={n.id}>
            <button className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start hover:bg-soft" onClick={() => { onClose(); nav(n.to); }}>
              <IconBadge tone={n.tone === 'gold' ? 'gold' : n.tone === 'danger' ? 'danger' : n.tone === 'warn' ? 'warn' : n.tone === 'info' ? 'info' : 'accent'} size={34}>
                <Bell size={16} />
              </IconBadge>
              <span className="min-w-0"><span className="block text-sm font-semibold">{n.title}</span><span className="block text-xs text-muted">{n.text}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-line px-4 py-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-semibold">{T('Напоминания браузера')}</span>
            <span className="block text-xs text-muted">{T('За 5 минут до начала задачи, пока приложение открыто. Фоновая доставка на телефонах не гарантируется.')}</span>
          </span>
          <Switch checked={settings.notifications} onChange={toggle} label={T('Напоминания браузера')} />
        </label>
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px] rtl:-translate-x-[22px]' : 'translate-x-0.5 rtl:-translate-x-0.5'}`} />
    </button>
  );
}

function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { settings, today } = useData();
  const { toast } = useUI();
  const nav = useNavigate();
  return (
    <div className="p-2">
      <div className="flex items-center gap-3 px-3 py-3">
        <Avatar size={42} />
        <div className="min-w-0">
          <p className="truncate font-bold">{settings.name || T('Гость')}</p>
          <p className="text-xs text-muted">{T('Данные хранятся на этом устройстве')}</p>
        </div>
      </div>
      <button className="btn btn-ghost w-full justify-start" onClick={() => { onClose(); nav('/settings'); }}><Settings size={17} />{T('Настройки и профиль')}</button>
      <button className="btn btn-ghost w-full justify-start" onClick={async () => {
        try { downloadJSON(await exportAll(), `nizam-backup-${today}.json`); await saveSettings({ lastBackupAt: Date.now() }); toast(T('Резервная копия сохранена')); onClose(); }
        catch (e) { toast(errMsg(e), 'error'); }
      }}><Download size={17} />{T('Скачать резервную копию')}</button>
    </div>
  );
}

function Avatar({ size = 36 }: { size?: number }) {
  const { settings } = useData();
  const ch = settings.name.trim().charAt(0).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-900 font-bold text-gold" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {ch || <UserRound size={size * 0.5} />}
    </span>
  );
}

function HeaderActions({ notices, onSearch, mobile = false }: { notices: Notice[]; onSearch: () => void; mobile?: boolean }) {
  const [panel, setPanel] = useState<'bell' | 'profile' | 'lang' | null>(null);
  const { settings } = useData();
  const dark = useIsDark();
  const nav = useNavigate();
  const close = useCallback(() => setPanel(null), []);
  const urgent = notices.filter((n) => n.tone === 'danger' || n.tone === 'gold' || n.tone === 'warn').length;
  return (
    <div className="relative flex items-center gap-1">
      {mobile && <button className="btn btn-ghost btn-icon" onClick={onSearch} aria-label={T('Поиск')}><Search size={20} /></button>}
      <button className="btn btn-ghost !min-h-10 !px-2 text-[13px] font-bold" onClick={() => setPanel(panel === 'lang' ? null : 'lang')}
        aria-label={T('Язык: {0}', LANGS.find((l) => l.code === settings.language)?.label ?? '')} aria-expanded={panel === 'lang'}>
        <Languages size={19} /><span className={settings.language === 'ar' ? 'arabic text-[15px]' : ''}>{LANGS.find((l) => l.code === settings.language)?.short}</span>
      </button>
      <button className="btn btn-ghost btn-icon relative" onClick={() => setPanel(panel === 'bell' ? null : 'bell')} aria-label={T('Уведомления: {0}', notices.length)} aria-expanded={panel === 'bell'}>
        <Bell size={20} />
        {notices.length > 0 && <span className={`absolute end-2 top-2 size-2 rounded-full ring-2 ring-card ${urgent ? 'bg-danger' : 'bg-gold'}`} />}
      </button>
      {!mobile && (
        <>
          <button className="btn btn-ghost btn-icon" onClick={() => saveSettings({ theme: dark ? 'light' : 'dark' })} aria-label={dark ? T('Светлая тема') : T('Тёмная тема')}>
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => nav('/settings')} aria-label={T('Настройки')}><Settings size={20} /></button>
        </>
      )}
      <button className="ms-1 rounded-full" onClick={() => setPanel(panel === 'profile' ? null : 'profile')} aria-label={T('Профиль')} aria-expanded={panel === 'profile'}>
        <Avatar size={mobile ? 34 : 38} />
      </button>
      <Popover open={panel === 'bell'} onClose={close} label={T('Уведомления')}><NotificationsPanel notices={notices} onClose={close} /></Popover>
      <Popover open={panel === 'profile'} onClose={close} label={T('Профиль')} className="sm:w-[300px]"><ProfilePanel onClose={close} /></Popover>
      <Popover open={panel === 'lang'} onClose={close} label={T('Язык интерфейса')} className="sm:w-[240px]">
        <ul className="grid p-2" role="listbox" aria-label={T('Язык интерфейса')}>
          {LANGS.map((l) => (
            <li key={l.code}>
              <button role="option" aria-selected={settings.language === l.code} lang={l.code}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-[15px] font-semibold hover:bg-soft ${settings.language === l.code ? 'text-accent' : ''}`}
                onClick={() => { close(); if (settings.language !== l.code) saveSettings({ language: l.code }); }}>
                <span className={l.code === 'ar' ? 'arabic' : ''}>{l.label}</span>
                {settings.language === l.code && <Check size={17} />}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}

/** Браузерные напоминания за 5 минут до начала задачи (пока приложение открыто). */
function useTaskReminders(todayInsts: ReturnType<typeof useInstances>) {
  const { settings, nowMin, today } = useData();
  useEffect(() => {
    if (!settings.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const i of todayInsts) {
      const st = parseTime(i.startTime);
      if (i.status !== 'planned' || st === null || nowMin < st - 5 || nowMin > st) continue;
      const key = `nizam-notified|${today}|${i.key}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch { /* хранилище недоступно — уведомим один раз за сессию */ }
      try { new Notification(T('НИЗАМ — скоро занятие'), { body: `${i.title}${i.startTime ? T(' в {0}', i.startTime) : ''}`, icon: './icon-192.png', tag: i.key }); } catch { /* мобильные браузеры */ }
    }
  }, [settings.notifications, nowMin, today, todayInsts]);
}

export function Layout({ children }: { children: ReactNode }) {
  const data = useData();
  const loc = useLocation();
  const [search, setSearch] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskOpen | null>(null);
  const todayInsts = useInstances(data.today, data.today);
  const notices = useMemo(() => buildNotices(data, todayInsts), [data, todayInsts]);
  useTaskReminders(todayInsts);

  const openSearch = useCallback(() => setSearch(true), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const openTask = useCallback((o?: TaskOpen) => setTaskForm(o ?? {}), []);
  const ctx = useMemo(() => ({ openTask, openSearch }), [openTask, openSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest('input, textarea, select, [contenteditable]') || e.target.closest('dialog'));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);

  const moreActive = MORE_ITEMS.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/')) || loc.pathname === '/more';
  const showFab = ['/', '/tasks', '/calendar'].includes(loc.pathname);

  return (
    <QuickCtx.Provider value={ctx}>
      <div className="min-h-dvh bg-bg text-fg">
        <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[70]">{T('К содержанию')}</a>
        <Sidebar />

        {/* Верхняя панель — компьютер */}
        <header className="sticky top-0 z-20 hidden h-[72px] items-center gap-4 border-b border-line/70 bg-bg/85 px-8 backdrop-blur-md lg:ms-[248px] lg:flex">
          <button onClick={openSearch} className="flex h-11 w-full max-w-[460px] items-center gap-3 rounded-xl border border-line bg-card px-3.5 text-sm text-muted transition-colors hover:border-accent/40" aria-label={T('Открыть поиск')}>
            <Search size={18} />{T('Поиск задач, целей, направлений…')}<kbd className="ms-auto rounded-md border border-line bg-soft px-1.5 py-0.5 font-sans text-[11px]">Ctrl K</kbd>
          </button>
          <div className="ms-auto flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => openTask()}><Plus size={18} />{T('Задача')}</button>
            <HeaderActions notices={notices} onSearch={openSearch} />
          </div>
        </header>

        {/* Верхняя панель — телефон и планшет */}
        <header className="safe-top sticky top-0 z-20 border-b border-line/70 bg-bg/90 backdrop-blur-md lg:hidden">
          <div className="flex h-16 items-center justify-between gap-2 px-4">
            <Brand compact />
            <HeaderActions notices={notices} onSearch={openSearch} mobile />
          </div>
        </header>

        <main id="main" className="lg:ms-[248px]">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(110px+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-6">{children}</div>
        </main>

        {showFab && (
          <button onClick={() => openTask()} aria-label={T('Добавить задачу')}
            className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] end-4 z-30 grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden">
            <Plus size={26} />
          </button>
        )}

        {/* Нижняя навигация */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur-md lg:hidden" aria-label={T('Нижнее меню')}>
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {MOBILE.map(({ to, label, icon: Icon }) => {
              const active = to === '/more' ? moreActive : to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);
              return (
                <NavLink key={to} to={to} aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${active ? 'text-accent' : 'text-muted'}`}>
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? 'bg-accent-soft' : ''}`}><Icon size={20} strokeWidth={active ? 2.2 : 1.9} /></span>
                  {T(label)}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <SearchPalette open={search} onClose={closeSearch} onTask={(t) => setTaskForm({ task: t })} />
        {taskForm && <TaskForm open onClose={() => setTaskForm(null)} task={taskForm.task} defaultDate={taskForm.date ?? data.today} preset={taskForm.preset} />}
      </div>
    </QuickCtx.Provider>
  );
}

/** Страница «Ещё» для телефона. */
export function MorePage() {
  const { timer } = useData();
  return (
    <div className="fade-in grid gap-4">
      <h1 className="h1">{T('Ещё')}</h1>
      {timer && <TimerPill />}
      <ul className="card-flat divide-y divide-line overflow-hidden">
        {MORE_ITEMS.map((to) => {
          const n = NAV.find((x) => x.to === to);
          if (!n) return null;
          const Icon = n.icon;
          return (
            <li key={to}>
              <NavLink to={to} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-soft">
                <IconBadge size={36}><Icon size={18} /></IconBadge>
                <span className="flex-1 font-semibold">{T(n.label)}</span>
                <ChevronRight size={18} className="text-muted rtl:-scale-x-100" />
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="relative overflow-hidden rounded-[18px] bg-brand-900 px-5 py-6 text-center text-white">
        <StarPattern className="absolute inset-0" opacity={0.18} color="#c4a56b" size={36} />
        <p className="arabic relative text-3xl text-gold" lang="ar">نِظَام</p>
        <p className="relative mt-1 text-xs text-white/75">{T('Порядок. Постоянство. Развитие.')}</p>
      </div>
    </div>
  );
}
