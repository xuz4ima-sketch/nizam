import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Info, Minimize2, Maximize2, Pause, Play, Square, Trash2, X, Zap } from 'lucide-react';
import { StarPattern } from '../components/Art';
import { Empty, Field, Modal, PageHeader, Tabs, errMsg, toNum, useUI } from '../components/ui';
import type { TimerState } from '../db/schema';
import {
  addDistraction, completeInstance, deleteSession, discardTimer, finishTimer, pauseTimer, pomodoroToBreak, pomodoroToWork,
  resumeTimer, saveSettings, startTimer, switchTimerMode, timerElapsed,
} from '../db/repo';
import { fmtClock, fmtMinutes, fmtShort, showTime, zonedParts } from '../lib/dates';
import { AREA_UNITS } from '../lib/labels';
import { findInstance, isActive } from '../lib/recurrence';
import { useData, useInstances, useNow } from '../state/data';

import { t as T } from '../i18n';
const FIVE_MS = 5 * 60_000;

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    o.start(); o.stop(ctx.currentTime + 0.9);
  } catch { /* звук недоступен */ }
}

function notify(text: string, enabled: boolean) {
  beep();
  if (enabled && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(T('НИЗАМ'), { body: text, icon: './icon-192.png' }); } catch { /* мобильные браузеры */ }
  }
}

export default function Focus() {
  const { timer } = useData();
  const [minimized, setMinimized] = useState(false);
  useEffect(() => { if (!timer) setMinimized(false); }, [timer]);
  return (
    <div className="fade-in grid gap-5">
      <PageHeader title={T('Концентрация')} subtitle={T('Таймер считает по реальному времени: переключение вкладок и перезагрузка не теряют ни минуты.')} />
      {timer ? <ActiveTimer t={timer} minimized={minimized} onToggle={() => setMinimized(!minimized)} /> : <StartForm />}
      <History />
    </div>
  );
}

function TimerRing({ progress, size, color, children }: { progress: number; size: number; color: string; children: React.ReactNode }) {
  const stroke = Math.round(size * 0.045);
  const R = (size - stroke) / 2 - 6, C = 2 * Math.PI * R;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={R + stroke} fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, progress)))} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

function StartForm() {
  const { today, areas, settings } = useData();
  const insts = useInstances(today, today).filter((i) => isActive(i) && i.status !== 'done' && i.status !== 'skipped');
  const { toast } = useUI();
  const [mode, setMode] = useState<TimerState['mode']>('pomodoro');
  const [target, setTarget] = useState(insts[0] ? `t:${insts[0].key}` : '');
  const [label, setLabel] = useState('');
  const [work, setWork] = useState(String(settings.pomodoroWork));
  const [brk, setBrk] = useState(String(settings.pomodoroBreak));

  async function start() {
    try {
      if (mode === 'pomodoro') {
        const w = toNum(work), b = toNum(brk);
        if (w !== settings.pomodoroWork || b !== settings.pomodoroBreak) await saveSettings({ pomodoroWork: w, pomodoroBreak: b });
      }
      const inst = target.startsWith('t:') ? insts.find((i) => i.key === target.slice(2)) : undefined;
      const area = target.startsWith('a:') ? areas.find((a) => a.id === target.slice(2)) : undefined;
      await startTimer({
        mode, label: inst?.title ?? area?.name ?? label, taskId: inst?.task.id, occKey: inst?.key,
        areaId: inst?.task.studyAreaId ?? area?.id,
      });
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  const previewMin = mode === 'pomodoro' ? toNum(work) : mode === 'five' ? 5 : 0;
  return (
    <section className="card grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
      <div className="grid justify-items-center gap-3 rounded-[20px] bg-card-2 py-6 text-accent ring-1 ring-line">
        <TimerRing progress={0} size={210} color="var(--accent)">
          <div>
            <p className="text-[46px] font-extrabold tabular-nums tracking-tight text-fg">{previewMin > 0 && Number.isFinite(previewMin) ? fmtClock(previewMin * 60_000) : '00:00'}</p>
            <p className="text-[13px] font-semibold text-muted">{mode === 'pomodoro' ? T('Работа') : mode === 'five' ? T('Минимальный шаг') : T('Свободный таймер')}</p>
          </div>
        </TimerRing>
        {mode === 'pomodoro' && (
          <div className="grid w-full max-w-[300px] grid-cols-3 gap-2 px-4 text-center">
            <div className="rounded-xl bg-card px-2 py-2 ring-1 ring-line"><p className="text-[15px] font-extrabold tabular-nums text-fg">{work || '—'}{' '}{T('мин')}</p><p className="text-[11px] text-muted">{T('Работа')}</p></div>
            <div className="rounded-xl bg-card px-2 py-2 ring-1 ring-line"><p className="text-[15px] font-extrabold tabular-nums text-fg">{brk || '—'}{' '}{T('мин')}</p><p className="text-[11px] text-muted">{T('Отдых')}</p></div>
            <div className="rounded-xl bg-card px-2 py-2 ring-1 ring-line"><p className="text-[15px] font-extrabold tabular-nums text-fg">∞</p><p className="text-[11px] text-muted">{T('Циклы')}</p></div>
          </div>
        )}
      </div>
      <div className="grid gap-4">
      <Tabs label={T('Режим таймера')} value={mode} onChange={setMode} items={[['pomodoro', 'Pomodoro'], ['free', T('Свободный')], ['five', T('Начни с 5 минут')]]} />
      {mode === 'five' && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{T('Выберите большую задачу и сделайте её минимальную часть всего за 5 минут. Например: открыть книгу и прочитать одну страницу. После этого можно остановиться — или продолжить.')}</p>
      )}
      <Field label={T('Чем заняться')} id="f-target">
        <select id="f-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{T('Без привязки (своё название)')}</option>
          {insts.length > 0 && (
            <optgroup label={T('Задачи на сегодня')}>
              {insts.map((i) => <option key={i.key} value={`t:${i.key}`}>{i.title}{i.startTime ? ` · ${i.startTime}` : ''}</option>)}
            </optgroup>
          )}
          {areas.length > 0 && (
            <optgroup label={T('Учебные направления')}>
              {areas.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
            </optgroup>
          )}
        </select>
      </Field>
      {!target && (
        <Field label={T('Название занятия')} id="f-label">
          <input id="f-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={T('Сосредоточенная работа')} maxLength={100} />
        </Field>
      )}
      {mode === 'pomodoro' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={T('Работа, мин')} id="f-w"><input id="f-w" type="number" min={1} max={180} className="input" value={work} onChange={(e) => setWork(e.target.value)} /></Field>
          <Field label={T('Отдых, мин')} id="f-b"><input id="f-b" type="number" min={1} max={60} className="input" value={brk} onChange={(e) => setBrk(e.target.value)} /></Field>
        </div>
      )}
      <button className="btn btn-primary min-h-12 text-base" onClick={start}><Play size={20} />{T('Начать')}</button>
      <p className="flex gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />{T('Веб-приложение не может блокировать другие приложения на телефоне. Включите режим «Не беспокоить» и уберите телефон из поля зрения.')}</p>
      </div>
    </section>
  );
}

function ActiveTimer({ t, minimized, onToggle }: { t: TimerState; minimized: boolean; onToggle: () => void }) {
  const { settings, areas, tasks, occurrences, sidx, sessions, today } = useData();
  const todayFocus = sessions.filter((s) => s.date === today && s.source === 'timer').reduce((a, s) => a + s.minutes, 0);
  const { toast, confirm } = useUI();
  const now = useNow(!!t.runningSince);
  const elapsed = timerElapsed(t, Math.max(now, t.runningSince ?? 0));
  const workMs = settings.pomodoroWork * 60_000;
  const breakMs = settings.pomodoroBreak * 60_000;
  const [finishing, setFinishing] = useState(false);
  const [distraction, setDistraction] = useState('');
  const fired = useRef('');
  const area = areas.find((a) => a.id === t.areaId);

  let goalMs = 0;
  if (t.mode === 'pomodoro') goalMs = t.phase === 'work' ? workMs : breakMs;
  if (t.mode === 'five') goalMs = FIVE_MS;
  const remaining = goalMs ? goalMs - elapsed : 0;
  const fiveDone = t.mode === 'five' && elapsed >= FIVE_MS;

  // Автоматические переходы Pomodoro (по меткам времени — срабатывают и после возврата на вкладку).
  useEffect(() => {
    if (t.mode !== 'pomodoro' || !t.runningSince || remaining > 0) return;
    const key = `${t.sessionStartedAt}|${t.phase}|${t.completedPomodoros}`;
    if (fired.current === key) return;
    fired.current = key;
    if (t.phase === 'work') {
      pomodoroToBreak(workMs).then(() => { notify(T('Рабочий период завершён и сохранён. Время отдохнуть.'), settings.notifications); toast(T('Период сохранён — отдых')); });
    } else {
      pomodoroToWork().then(() => notify(T('Отдых окончен. Готовы продолжить?'), settings.notifications));
    }
  }, [remaining, t, workMs, settings.notifications, toast]);

  useEffect(() => {
    if (fiveDone && fired.current !== `five|${t.sessionStartedAt}`) {
      fired.current = `five|${t.sessionStartedAt}`;
      notify(T('5 минут прошло! Вы начали — это главное.'), settings.notifications);
    }
  }, [fiveDone, t.sessionStartedAt, settings.notifications]);

  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onToggle(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [minimized, onToggle]);

  useEffect(() => {
    document.title = T('{0} · НИЗАМ', fmtClock(goalMs ? Math.max(0, remaining) : elapsed));
    return () => { document.title = T('НИЗАМ — نِظَام'); };
  }, [elapsed, remaining, goalMs]);

  const shown = goalMs ? Math.max(0, remaining) : elapsed;
  const ring = goalMs ? Math.min(1, elapsed / goalMs) : (elapsed % 3_600_000) / 3_600_000;
  const phaseLabel = t.phase === 'break' ? T('Отдых') : t.mode === 'five' ? T('Начни с 5 минут') : t.mode === 'pomodoro' ? T('Работа · помидор {0}', t.completedPomodoros + 1) : T('Свободный таймер');

  if (minimized) {
    return (
      <section className="card flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted">{phaseLabel}</p>
          <p className="truncate font-bold">{t.label}</p>
        </div>
        <p className="text-3xl font-extrabold tabular-nums" role="timer">{fmtClock(shown)}</p>
        {t.runningSince
          ? <button className="btn btn-outline" onClick={() => pauseTimer()}><Pause size={18} />{T('Пауза')}</button>
          : <button className="btn btn-primary" onClick={() => resumeTimer()}><Play size={18} />{T('Продолжить')}</button>}
        <button className="btn btn-deep" onClick={onToggle}><Maximize2 size={17} />{T('Полный экран')}</button>
      </section>
    );
  }

  // Портал в body: предки с анимацией transform иначе «запирают» position: fixed внутри себя.
  return createPortal(
    <section className="fade fixed inset-0 z-[55] flex flex-col overflow-y-auto bg-bg text-fg" role="dialog" aria-modal="true" aria-label={T('Режим концентрации')}>
      <div className="pointer-events-none absolute inset-0 text-accent"><StarPattern opacity={0.05} size={56} /></div>
      <div className="safe-top relative flex items-center justify-between gap-2 px-4 pt-4 sm:px-8">
        <p className="text-[13px] font-semibold text-muted">{T('Сегодня в фокусе:')}{' '}<span className="tabular-nums text-fg">{fmtMinutes(todayFocus)}</span>{t.mode === 'pomodoro' && <>{' '}{T('· циклов:')}{' '}<span className="tabular-nums text-fg">{t.completedPomodoros}</span></>}</p>
        <button className="btn btn-ghost" onClick={onToggle} aria-label={T('Свернуть режим концентрации')}><Minimize2 size={17} /><span className="hidden sm:inline">{T('Свернуть')}</span></button>
      </div>
      <div className="relative mx-auto grid w-full max-w-lg flex-1 content-center justify-items-center gap-6 px-4 py-6">
      <div className="text-center">
        <p className="eyebrow">{phaseLabel}</p>
        <h2 className="mt-2 text-balance text-[22px] font-extrabold tracking-tight sm:text-2xl">{t.label}</h2>
        {area && <p className="mt-1 text-[13px] text-muted">{area.name}</p>}
      </div>
      <div className={t.phase === 'break' ? 'text-gold' : 'text-accent'}>
        <TimerRing progress={ring} size={Math.min(300, typeof window !== 'undefined' ? window.innerWidth - 48 : 300)} color={t.phase === 'break' ? 'var(--gold)' : 'var(--accent)'}>
          <div>
            <p className="text-[56px] font-extrabold leading-none tabular-nums tracking-tight text-fg sm:text-[64px]" role="timer" aria-live="off">{fmtClock(shown)}</p>
            <p className="mt-2 text-[13px] font-semibold text-muted">{t.runningSince ? (goalMs ? T('осталось') : T('прошло')) : T('пауза')}</p>
          </div>
        </TimerRing>
      </div>

      {fiveDone && t.phase === 'work' && (
        <div className="w-full max-w-md rounded-xl bg-accent-soft p-3 text-center text-sm">
          <p className="font-medium">{T('5 минут позади — вы начали!')}</p>
          <p className="mb-2 text-muted">{T('Можно завершить или продолжить в свободном режиме.')}</p>
          <button className="btn btn-sm btn-primary" onClick={() => switchTimerMode('free')}><Zap size={14} />{T('Продолжить дальше')}</button>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {t.phase === 'break' && !t.runningSince ? (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />{T('Продолжить')}</button>
        ) : t.phase === 'work' && !t.runningSince && t.accumulatedMs === 0 ? (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />{T('Начать следующий период')}</button>
        ) : t.runningSince ? (
          <button className="btn btn-outline min-h-12 px-6" onClick={() => pauseTimer()}><Pause size={20} />{T('Пауза')}</button>
        ) : (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />{T('Продолжить')}</button>
        )}
        {t.phase === 'break' && (
          <button className="btn btn-outline min-h-12" onClick={() => pomodoroToWork().then(() => resumeTimer())}><Coffee size={18} />{T('Пропустить отдых')}</button>
        )}
        <button className="btn btn-outline min-h-12" onClick={() => setFinishing(true)}><Square size={18} />{T('Завершить')}</button>
        <button className="btn btn-ghost min-h-12 !text-danger" onClick={async () => {
          if (await confirm({ title: T('Сбросить сеанс?'), message: T('Несохранённое время текущего периода не будет записано. Уже сохранённые периоды останутся.'), confirmText: T('Сбросить'), danger: true })) await discardTimer();
        }}><X size={18} />{T('Сбросить')}</button>
      </div>

      <form className="flex w-full max-w-md gap-2 opacity-80 focus-within:opacity-100" onSubmit={async (e) => {
        e.preventDefault();
        if (!distraction.trim()) return;
        await addDistraction(distraction);
        setDistraction('');
        toast(T('Отвлечение записано'));
      }}>
        <label className="sr-only" htmlFor="f-dis">{T('Причина отвлечения')}</label>
        <input id="f-dis" className="input" placeholder={T('Что отвлекло? (телефон, шум…)')} value={distraction} onChange={(e) => setDistraction(e.target.value)} maxLength={200} />
        <button className="btn btn-outline shrink-0">{T('Записать')}</button>
      </form>
      {t.distractions.length > 0 && (
        <ul className="w-full max-w-md text-sm text-muted">
          {t.distractions.map((d, i) => <li key={i}>· {showTime(zonedParts(d.at, settings.timeZone).minutes)} — {d.reason}</li>)}
        </ul>
      )}
      </div>
      {finishing && (
        <FinishDialog t={t} unit={area && area.unit !== 'min' ? AREA_UNITS[area.unit].label.toLowerCase() : undefined}
          minutes={t.phase === 'work' ? Math.round(Math.min(elapsed, t.mode === 'pomodoro' ? workMs : Infinity) / 60_000) : 0}
          onClose={() => setFinishing(false)}
          onDone={async (amount, note, markDone) => {
            try {
              const saved = await finishTimer({ amount, note }, t.mode === 'pomodoro' && t.phase === 'work' ? workMs : undefined);
              if (markDone && t.occKey) {
                const inst = findInstance(tasks, occurrences, sidx, t.occKey);
                if (inst) await completeInstance(inst, { status: 'done', totalMin: 0 });
              }
              toast(saved ? T('Сохранено: {0}', fmtMinutes(saved)) : T('Сеанс завершён (меньше минуты — время не записано)'));
              setFinishing(false);
            } catch (e) { toast(errMsg(e), 'error'); }
          }} />
      )}
    </section>,
    document.body,
  );
}

function FinishDialog({ t, minutes, unit, onClose, onDone }: {
  t: TimerState; minutes: number; unit?: string; onClose: () => void; onDone: (amount: number | undefined, note: string, markDone: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal open onClose={onClose} title={T('Завершить сеанс')}>
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const a = amount.trim() ? toNum(amount) : undefined;
        if (a !== undefined && (!Number.isFinite(a) || a < 0 || a > 10_000)) return setErr(T('Объём: число от 0 до 10000'));
        onDone(a, note, markDone);
      }}>
        <p className="text-sm">{T('Будет сохранено:')}{' '}<b>{fmtMinutes(minutes)}</b>{t.phase === 'break' && T(' (идёт отдых — рабочее время уже сохранено)')}.</p>
        {unit && (
          <Field label={T('Выполненный объём ({0})', unit)} error={err} id="fin-amt">
            <input id="fin-amt" className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label={T('Заметка')} id="fin-note"><input id="fin-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        {t.occKey && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} />{T('Отметить задачу выполненной')}</label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>{T('Вернуться')}</button>
          <button className="btn btn-primary">{T('Сохранить и завершить')}</button>
        </div>
      </form>
    </Modal>
  );
}

function History() {
  const { sessions, today, areas, tasks, settings } = useData();
  const { confirm, toast } = useUI();
  const list = useMemo(() => [...sessions].filter((s) => s.source === 'timer').sort((a, b) => b.startedAt - a.startedAt).slice(0, 30), [sessions]);
  const todayMin = sessions.filter((s) => s.date === today && s.source === 'timer').reduce((a, s) => a + s.minutes, 0);
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="h2">{T('История сеансов')}</h2>
        <span className="text-sm text-muted">{T('Сегодня в фокусе:')}{' '}{fmtMinutes(todayMin)}</span>
      </div>
      {!list.length ? <Empty title={T('Сеансов пока нет')} text={T('Запустите таймер — завершённые сеансы появятся здесь.')} /> : (
        <ul className="grid gap-2">
          {list.map((s) => {
            const name = tasks.find((t) => t.id === s.taskId)?.title ?? areas.find((a) => a.id === s.areaId)?.name ?? s.note ?? T('Сосредоточенная работа');
            return (
              <li key={s.id} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-xs text-muted">
                    {fmtShort(s.date)} · {showTime(zonedParts(s.startedAt, settings.timeZone).minutes)}–{showTime(zonedParts(s.endedAt, settings.timeZone).minutes)}
                    {s.distractions?.length ? T(' · отвлечений: {0}', s.distractions.length) : ''}{s.amount ? T(' · объём: {0}', s.amount) : ''}
                  </p>
                </div>
                <span className="tabular-nums font-medium">{fmtMinutes(s.minutes)}</span>
                <button className="btn btn-ghost btn-icon !text-danger" aria-label={T('Удалить сеанс')} onClick={async () => {
                  if (await confirm({ title: T('Удалить сеанс?'), message: T('Его время будет вычтено из статистики.'), confirmText: T('Удалить'), danger: true })) {
                    await deleteSession(s.id); toast(T('Сеанс удалён'));
                  }
                }}><Trash2 size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
