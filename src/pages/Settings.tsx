import { useRef, useState } from 'react';
import { Download, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { Field, PageHeader, errFields, errMsg, toNum, useUI } from '../components/ui';
import { clearAll, downloadJSON, exportAll, importAll, validateBackup } from '../db/backup';
import { saveSettings } from '../db/repo';
import type { Settings } from '../db/schema';
import { isValidTimeZone, zonedParts, fmtTime } from '../lib/dates';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';

const ZONES = ['Africa/Cairo', 'Europe/Moscow', 'Europe/Istanbul', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tashkent', 'Asia/Almaty', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Europe/London', 'UTC'];

export default function SettingsPage() {
  const { settings, tasks, sessions, habits, areas, goals, today } = useData();
  const { toast, confirm } = useUI();
  const [f, setF] = useState({
    name: settings.name, timeZone: settings.timeZone, weekStart: String(settings.weekStart), dayStart: settings.dayStart, dayEnd: settings.dayEnd,
    pomodoroWork: String(settings.pomodoroWork), pomodoroBreak: String(settings.pomodoroBreak), maxCarry: String(Math.round(settings.maxCarryRatio * 100)),
  });
  const [errors, setErrors] = useState<Errors>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [...new Set([...ZONES, browserTz, settings.timeZone])];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidTimeZone(f.timeZone)) return setErrors({ timeZone: 'Неизвестный часовой пояс' });
    const carry = toNum(f.maxCarry);
    if (!Number.isFinite(carry) || carry < 0 || carry > 200) return setErrors({ maxCarry: 'От 0 до 200%' });
    try {
      await saveSettings({
        name: f.name.trim(), timeZone: f.timeZone, weekStart: f.weekStart === '0' ? 0 : 1, dayStart: f.dayStart, dayEnd: f.dayEnd,
        pomodoroWork: toNum(f.pomodoroWork), pomodoroBreak: toNum(f.pomodoroBreak), maxCarryRatio: carry / 100,
      });
      setErrors({});
      toast('Настройки сохранены');
    } catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
  }

  async function doExport() {
    try {
      const data = await exportAll();
      downloadJSON(data, `nizam-backup-${today}.json`);
      await saveSettings({ lastBackupAt: Date.now() });
      toast('Резервная копия сохранена');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  async function doImport(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const v = validateBackup(raw);
      if (!v.ok) { toast(v.error, 'error'); return; }
      const c = v.counts;
      const ok = await confirm({
        title: 'Восстановить из копии?',
        message: <>Текущие данные будут <b>заменены</b> содержимым файла: задач {c.tasks}, сеансов {c.sessions}, привычек {c.habits}, направлений {c.areas}, целей {c.goals}, обзоров {c.reviews}. Рекомендуется сначала экспортировать текущие данные.</>,
        confirmText: 'Заменить данные', danger: true,
      });
      if (!ok) return;
      await importAll(raw);
      toast('Данные восстановлены');
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Файл повреждён или не является JSON' : errMsg(e), 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const themes: [Settings['theme'], string, typeof Sun][] = [['light', 'Светлая', Sun], ['dark', 'Тёмная', Moon], ['system', 'Как в системе', Monitor]];

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title="Настройки" />
      <section className="card grid gap-3">
        <h2 className="h2">Тема</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Тема оформления">
          {themes.map(([k, l, Icon]) => (
            <button key={k} role="radio" aria-checked={settings.theme === k} onClick={() => saveSettings({ theme: k })}
              className={`btn flex-col !py-3 ${settings.theme === k ? 'border-2 border-accent bg-accent-soft text-accent' : 'btn-outline'}`}>
              <Icon size={20} />{l}
            </button>
          ))}
        </div>
      </section>

      <form className="card grid gap-3" onSubmit={save} noValidate>
        <h2 className="h2">Основное</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ваше имя (для приветствия)" error={errors.name} id="s-name"><input id="s-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={60} /></Field>
          <Field label="Язык" id="s-lang"><select id="s-lang" className="input" disabled><option>Русский</option></select></Field>
          <Field label="Часовой пояс" error={errors.timeZone} hint={`Сейчас там: ${fmtTime(zonedParts(Date.now(), isValidTimeZone(f.timeZone) ? f.timeZone : 'UTC').minutes)}. День определяется по этому поясу.`} id="s-tz">
            <input id="s-tz" className="input" list="zones" value={f.timeZone} onChange={(e) => set('timeZone', e.target.value)} />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <Field label="Начало недели" id="s-ws">
            <select id="s-ws" className="input" value={f.weekStart} onChange={(e) => set('weekStart', e.target.value)}>
              <option value="1">Понедельник</option><option value="0">Воскресенье</option>
            </select>
          </Field>
          <Field label="Рабочий день: начало" error={errors.dayStart} id="s-ds"><input id="s-ds" type="time" className="input" value={f.dayStart} onChange={(e) => set('dayStart', e.target.value)} /></Field>
          <Field label="Рабочий день: конец" error={errors.dayEnd} id="s-de"><input id="s-de" type="time" className="input" value={f.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} /></Field>
          <Field label="Pomodoro: работа, мин" error={errors.pomodoroWork} id="s-pw"><input id="s-pw" type="number" min={1} max={180} className="input" value={f.pomodoroWork} onChange={(e) => set('pomodoroWork', e.target.value)} /></Field>
          <Field label="Pomodoro: отдых, мин" error={errors.pomodoroBreak} id="s-pb"><input id="s-pb" type="number" min={1} max={60} className="input" value={f.pomodoroBreak} onChange={(e) => set('pomodoroBreak', e.target.value)} /></Field>
          <Field label="Лимит компенсации нормы, %" error={errors.maxCarry} hint="Сколько максимум можно добавить к дневной норме из вчерашнего долга" id="s-mc"><input id="s-mc" type="number" min={0} max={200} className="input" value={f.maxCarry} onChange={(e) => set('maxCarry', e.target.value)} /></Field>
        </div>
        <button className="btn btn-primary justify-self-end">Сохранить</button>
      </form>

      <section className="card grid gap-3">
        <h2 className="h2">Уведомления</h2>
        <p className="muted">Звуковой сигнал и системное уведомление по окончании периода Pomodoro (пока вкладка открыта). Фоновые напоминания в закрытом браузере веб-приложение надёжно обеспечить не может.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={settings.notifications} onChange={async (e) => {
            const on = e.target.checked;
            if (on && 'Notification' in window && Notification.permission !== 'granted') {
              const p = await Notification.requestPermission();
              if (p !== 'granted') { toast('Браузер не разрешил уведомления', 'error'); return; }
            }
            await saveSettings({ notifications: on });
          }} />
          Системные уведомления таймера
        </label>
      </section>

      <section className="card grid gap-3">
        <h2 className="h2">Резервная копия</h2>
        <p className="muted">
          Данные хранятся только в этом браузере (IndexedDB) и работают без интернета. Регулярно сохраняйте копию в файл — например, раз в неделю —
          и храните её в облаке или на другом устройстве. Последняя копия: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('ru-RU') : 'ещё не создавалась'}.
        </p>
        <p className="text-sm">В базе: задач {tasks.length}, сеансов {sessions.length}, привычек {habits.length}, направлений {areas.length}, целей {goals.length}.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={doExport}><Download size={18} />Экспорт в JSON</button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={18} />Импорт из JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Файл резервной копии" onChange={(e) => { const file = e.target.files?.[0]; if (file) doImport(file); }} />
        </div>
      </section>

      <section className="card grid gap-3 border-danger/40">
        <h2 className="h2 text-danger">Опасная зона</h2>
        <p className="muted">Удаление всех задач, привычек, направлений, целей, сеансов и обзоров. Настройки сохранятся. Действие необратимо.</p>
        <button className="btn btn-danger justify-self-start" onClick={async () => {
          const ok = await confirm({ title: 'Удалить все данные?', message: 'Это действие нельзя отменить. Сначала сделайте экспорт, если данные нужны.', confirmText: 'Удалить всё', danger: true });
          if (ok) { await clearAll(true); toast('Все данные удалены'); }
        }}><Trash2 size={18} />Удалить все данные</button>
      </section>

      <p className="text-center text-xs text-muted">НИЗАМ v1.0 · локальное хранение · без платных API</p>
    </div>
  );
}
