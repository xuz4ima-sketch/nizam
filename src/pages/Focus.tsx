import { useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Info, Pause, Play, Square, Trash2, X, Zap } from 'lucide-react';
import { Empty, Field, Modal, PageHeader, Tabs, errMsg, toNum, useUI } from '../components/ui';
import type { TimerState } from '../db/schema';
import {
  addDistraction, completeInstance, deleteSession, discardTimer, finishTimer, pauseTimer, pomodoroToBreak, pomodoroToWork,
  resumeTimer, saveSettings, startTimer, switchTimerMode, timerElapsed,
} from '../db/repo';
import { fmtClock, fmtMinutes, fmtShort, fmtTime, zonedParts } from '../lib/dates';
import { AREA_UNITS } from '../lib/labels';
import { findInstance, isActive } from '../lib/recurrence';
import { useData, useInstances, useNow } from '../state/data';

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
    try { new Notification('НИЗАМ', { body: text, icon: './icon-192.png' }); } catch { /* мобильные браузеры */ }
  }
}

export default function Focus() {
  const { timer } = useData();
  return (
    <div className="fade-in grid gap-5">
      <PageHeader title="Режим концентрации" subtitle="Таймер считает по временным меткам: переключение вкладок и перезагрузка не теряют время." />
      {timer ? <ActiveTimer t={timer} /> : <StartForm />}
      <History />
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

  return (
    <section className="card grid gap-4">
      <Tabs label="Режим таймера" value={mode} onChange={setMode} items={[['pomodoro', 'Pomodoro'], ['free', 'Свободный'], ['five', 'Начни с 5 минут']]} />
      {mode === 'five' && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">
          Выберите большую задачу и сделайте её минимальную часть всего за 5 минут. Например: открыть книгу и прочитать одну страницу. После этого можно остановиться — или продолжить.
        </p>
      )}
      <Field label="Чем заняться" id="f-target">
        <select id="f-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Без привязки (своё название)</option>
          {insts.length > 0 && (
            <optgroup label="Задачи на сегодня">
              {insts.map((i) => <option key={i.key} value={`t:${i.key}`}>{i.title}{i.startTime ? ` · ${i.startTime}` : ''}</option>)}
            </optgroup>
          )}
          {areas.length > 0 && (
            <optgroup label="Учебные направления">
              {areas.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
            </optgroup>
          )}
        </select>
      </Field>
      {!target && (
        <Field label="Название занятия" id="f-label">
          <input id="f-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Сосредоточенная работа" maxLength={100} />
        </Field>
      )}
      {mode === 'pomodoro' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Работа, мин" id="f-w"><input id="f-w" type="number" min={1} max={180} className="input" value={work} onChange={(e) => setWork(e.target.value)} /></Field>
          <Field label="Отдых, мин" id="f-b"><input id="f-b" type="number" min={1} max={60} className="input" value={brk} onChange={(e) => setBrk(e.target.value)} /></Field>
        </div>
      )}
      <button className="btn btn-primary min-h-12 text-base" onClick={start}><Play size={20} />Начать</button>
      <p className="flex gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        Веб-приложение не может блокировать другие приложения на телефоне. Включите режим «Не беспокоить» и уберите телефон из поля зрения.
      </p>
    </section>
  );
}

function ActiveTimer({ t }: { t: TimerState }) {
  const { settings, areas, tasks, occurrences, sidx } = useData();
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
      pomodoroToBreak(workMs).then(() => { notify('Рабочий период завершён и сохранён. Время отдохнуть.', settings.notifications); toast('Период сохранён — отдых'); });
    } else {
      pomodoroToWork().then(() => notify('Отдых окончен. Готовы продолжить?', settings.notifications));
    }
  }, [remaining, t, workMs, settings.notifications, toast]);

  useEffect(() => {
    if (fiveDone && fired.current !== `five|${t.sessionStartedAt}`) {
      fired.current = `five|${t.sessionStartedAt}`;
      notify('5 минут прошло! Вы начали — это главное.', settings.notifications);
    }
  }, [fiveDone, t.sessionStartedAt, settings.notifications]);

  useEffect(() => {
    document.title = `${fmtClock(goalMs ? Math.max(0, remaining) : elapsed)} · НИЗАМ`;
    return () => { document.title = 'НИЗАМ — نِظَام'; };
  }, [elapsed, remaining, goalMs]);

  const shown = goalMs ? Math.max(0, remaining) : elapsed;
  const ring = goalMs ? Math.min(1, elapsed / goalMs) : (elapsed % 3_600_000) / 3_600_000;
  const R = 108, C = 2 * Math.PI * R;
  const phaseLabel = t.phase === 'break' ? 'Отдых' : t.mode === 'five' ? 'Начни с 5 минут' : t.mode === 'pomodoro' ? `Работа · помидор ${t.completedPomodoros + 1}` : 'Свободный таймер';

  return (
    <section className="card grid justify-items-center gap-5 py-6">
      <div className="text-center">
        <p className="text-sm text-muted">{phaseLabel}</p>
        <h2 className="mt-1 text-lg font-semibold">{t.label}</h2>
        {area && <p className="text-xs text-muted">Направление: {area.name}</p>}
      </div>
      <div className="relative grid place-items-center">
        <svg width="240" height="240" viewBox="0 0 240 240" className="-rotate-90" aria-hidden>
          <circle cx="120" cy="120" r={R} fill="none" stroke="var(--soft)" strokeWidth="12" />
          <circle cx="120" cy="120" r={R} fill="none" stroke={t.phase === 'break' ? '#f59e0b' : 'var(--accent)'} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - ring)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute text-center">
          <p className="text-5xl font-semibold tabular-nums tracking-tight" role="timer" aria-live="off">{fmtClock(shown)}</p>
          <p className="mt-1 text-xs text-muted">{t.runningSince ? (goalMs ? 'осталось' : 'прошло') : 'пауза'}</p>
        </div>
      </div>

      {fiveDone && t.phase === 'work' && (
        <div className="w-full max-w-md rounded-xl bg-accent-soft p-3 text-center text-sm">
          <p className="font-medium">5 минут позади — вы начали!</p>
          <p className="mb-2 text-muted">Можно завершить или продолжить в свободном режиме.</p>
          <button className="btn btn-sm btn-primary" onClick={() => switchTimerMode('free')}><Zap size={14} />Продолжить дальше</button>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {t.phase === 'break' && !t.runningSince ? (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />Продолжить</button>
        ) : t.phase === 'work' && !t.runningSince && t.accumulatedMs === 0 ? (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />Начать следующий период</button>
        ) : t.runningSince ? (
          <button className="btn btn-outline min-h-12 px-6" onClick={() => pauseTimer()}><Pause size={20} />Пауза</button>
        ) : (
          <button className="btn btn-primary min-h-12 px-6" onClick={() => resumeTimer()}><Play size={20} />Продолжить</button>
        )}
        {t.phase === 'break' && (
          <button className="btn btn-outline min-h-12" onClick={() => pomodoroToWork().then(() => resumeTimer())}><Coffee size={18} />Пропустить отдых</button>
        )}
        <button className="btn btn-outline min-h-12" onClick={() => setFinishing(true)}><Square size={18} />Завершить</button>
        <button className="btn btn-ghost min-h-12 !text-danger" onClick={async () => {
          if (await confirm({ title: 'Сбросить сеанс?', message: 'Несохранённое время текущего периода не будет записано. Уже сохранённые периоды останутся.', confirmText: 'Сбросить', danger: true })) await discardTimer();
        }}><X size={18} />Сбросить</button>
      </div>

      <form className="flex w-full max-w-md gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!distraction.trim()) return;
        await addDistraction(distraction);
        setDistraction('');
        toast('Отвлечение записано');
      }}>
        <label className="sr-only" htmlFor="f-dis">Причина отвлечения</label>
        <input id="f-dis" className="input" placeholder="Что отвлекло? (телефон, шум…)" value={distraction} onChange={(e) => setDistraction(e.target.value)} maxLength={200} />
        <button className="btn btn-outline shrink-0">Записать</button>
      </form>
      {t.distractions.length > 0 && (
        <ul className="w-full max-w-md text-sm text-muted">
          {t.distractions.map((d, i) => <li key={i}>· {fmtTime(zonedParts(d.at, settings.timeZone).minutes)} — {d.reason}</li>)}
        </ul>
      )}
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
              toast(saved ? `Сохранено: ${fmtMinutes(saved)}` : 'Сеанс завершён (меньше минуты — время не записано)');
              setFinishing(false);
            } catch (e) { toast(errMsg(e), 'error'); }
          }} />
      )}
    </section>
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
    <Modal open onClose={onClose} title="Завершить сеанс">
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const a = amount.trim() ? toNum(amount) : undefined;
        if (a !== undefined && (!Number.isFinite(a) || a < 0 || a > 10_000)) return setErr('Объём: число от 0 до 10000');
        onDone(a, note, markDone);
      }}>
        <p className="text-sm">Будет сохранено: <b>{fmtMinutes(minutes)}</b>{t.phase === 'break' && ' (идёт отдых — рабочее время уже сохранено)'}.</p>
        {unit && (
          <Field label={`Выполненный объём (${unit})`} error={err} id="fin-amt">
            <input id="fin-amt" className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label="Заметка" id="fin-note"><input id="fin-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        {t.occKey && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} />
            Отметить задачу выполненной
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>Вернуться</button>
          <button className="btn btn-primary">Сохранить и завершить</button>
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
        <h2 className="h2">История сеансов</h2>
        <span className="text-sm text-muted">Сегодня в фокусе: {fmtMinutes(todayMin)}</span>
      </div>
      {!list.length ? <Empty title="Сеансов пока нет" text="Запустите таймер — завершённые сеансы появятся здесь." /> : (
        <ul className="grid gap-2">
          {list.map((s) => {
            const name = tasks.find((t) => t.id === s.taskId)?.title ?? areas.find((a) => a.id === s.areaId)?.name ?? s.note ?? 'Сосредоточенная работа';
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-xs text-muted">
                    {fmtShort(s.date)} · {fmtTime(zonedParts(s.startedAt, settings.timeZone).minutes)}–{fmtTime(zonedParts(s.endedAt, settings.timeZone).minutes)}
                    {s.distractions?.length ? ` · отвлечений: ${s.distractions.length}` : ''}{s.amount ? ` · объём: ${s.amount}` : ''}
                  </p>
                </div>
                <span className="tabular-nums font-medium">{fmtMinutes(s.minutes)}</span>
                <button className="btn btn-ghost btn-icon !text-danger" aria-label="Удалить сеанс" onClick={async () => {
                  if (await confirm({ title: 'Удалить сеанс?', message: 'Его время будет вычтено из статистики.', confirmText: 'Удалить', danger: true })) {
                    await deleteSession(s.id); toast('Сеанс удалён');
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
