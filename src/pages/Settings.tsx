import { useRef, useState } from 'react';
import { Download, MonitorSmartphone, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { Switch } from '../components/Layout';
import { LANGS } from '../i18n';
import { isStandalone, useInstallPrompt } from '../lib/install';
import { HIJRI_METHOD } from '../lib/dates';
import { Field, PageHeader, errFields, errMsg, toNum, useUI } from '../components/ui';
import { clearAll, downloadJSON, exportAll, importAll, validateBackup } from '../db/backup';
import { saveSettings } from '../db/repo';
import type { Settings } from '../db/schema';
import { isValidTimeZone, zonedParts, fmtTime } from '../lib/dates';
import type { Errors } from '../lib/validate';
import { useData } from '../state/data';

import { t as T } from '../i18n';
const ZONES = ['Africa/Cairo', 'Europe/Moscow', 'Europe/Istanbul', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tashkent', 'Asia/Almaty', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Europe/London', 'UTC'];

export default function SettingsPage() {
  const { settings, tasks, sessions, habits, areas, goals, today } = useData();
  const { toast, confirm } = useUI();
  const [f, setF] = useState({
    name: settings.name, timeZone: settings.timeZone, weekStart: String(settings.weekStart), dayStart: settings.dayStart, dayEnd: settings.dayEnd,
    pomodoroWork: String(settings.pomodoroWork), pomodoroBreak: String(settings.pomodoroBreak), maxCarry: String(Math.round(settings.maxCarryRatio * 100)),
    timeFormat: settings.timeFormat, greetTitle: settings.greetTitle, greetText: settings.greetText,
  });
  const { available: canInstall, install } = useInstallPrompt();
  const [errors, setErrors] = useState<Errors>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [...new Set([...ZONES, browserTz, settings.timeZone])];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidTimeZone(f.timeZone)) return setErrors({ timeZone: T('Неизвестный часовой пояс') });
    const carry = toNum(f.maxCarry);
    if (!Number.isFinite(carry) || carry < 0 || carry > 200) return setErrors({ maxCarry: T('От 0 до 200%') });
    try {
      await saveSettings({
        name: f.name.trim(), timeZone: f.timeZone, weekStart: f.weekStart === '0' ? 0 : 1, dayStart: f.dayStart, dayEnd: f.dayEnd,
        pomodoroWork: toNum(f.pomodoroWork), pomodoroBreak: toNum(f.pomodoroBreak), maxCarryRatio: carry / 100,
        timeFormat: f.timeFormat === '12' ? '12' : '24', greetTitle: f.greetTitle.trim(), greetText: f.greetText.trim(),
      });
      setErrors({});
      toast(T('Настройки сохранены'));
    } catch (err) { setErrors(errFields(err)); toast(errMsg(err), 'error'); }
  }

  async function doExport() {
    try {
      const data = await exportAll();
      downloadJSON(data, `nizam-backup-${today}.json`);
      await saveSettings({ lastBackupAt: Date.now() });
      toast(T('Резервная копия сохранена'));
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  async function doImport(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const v = validateBackup(raw);
      if (!v.ok) { toast(v.error, 'error'); return; }
      const c = v.counts;
      const ok = await confirm({
        title: T('Восстановить из копии?'),
        message: <>{T('Текущие данные будут')}{' '}<b>{T('заменены')}</b>{' '}{T('содержимым файла: задач')}{' '}{c.tasks}{T(', сеансов')}{' '}{c.sessions}{T(', привычек')}{' '}{c.habits}{T(', направлений')}{' '}{c.areas}{T(', целей')}{' '}{c.goals}{T(', обзоров')}{' '}{c.reviews}{T('. Рекомендуется сначала экспортировать текущие данные.')}</>,
        confirmText: T('Заменить данные'), danger: true,
      });
      if (!ok) return;
      await importAll(raw);
      toast(T('Данные восстановлены'));
    } catch (e) {
      toast(e instanceof SyntaxError ? T('Файл повреждён или не является JSON') : errMsg(e), 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const themes: [Settings['theme'], string, typeof Sun][] = [['light', T('Светлая'), Sun], ['dark', T('Тёмная'), Moon], ['system', T('Как в системе'), Monitor]];

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title={T('Настройки')} />
      <section className="card grid gap-3">
        <h2 className="h2">{T('Тема')}</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={T('Тема оформления')}>
          {themes.map(([k, l, Icon]) => (
            <button key={k} role="radio" aria-checked={settings.theme === k} onClick={() => saveSettings({ theme: k })}
              className={`btn flex-col !py-3 ${settings.theme === k ? 'border-2 border-accent bg-accent-soft text-accent' : 'btn-outline'}`}>
              <Icon size={20} />{l}
            </button>
          ))}
        </div>
      </section>

      <form className="card grid gap-3" onSubmit={save} noValidate>
        <h2 className="h2">{T('Основное')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={T('Ваше имя (для приветствия)')} error={errors.name} id="s-name"><input id="s-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={60} /></Field>
          <Field label={T('Язык интерфейса')} hint={T('Арабский интерфейс отображается справа налево')} id="s-lang">
            <select id="s-lang" className="input" value={settings.language} onChange={(e) => saveSettings({ language: e.target.value as Settings['language'] })}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label={T('Фон приветствия')} id="s-hero">
            <select id="s-hero" className="input" value={settings.heroStyle} onChange={(e) => saveSettings({ heroStyle: e.target.value as Settings['heroStyle'] })}>
              <option value="name">{T('Название «نِظَام»')}</option>
              <option value="letter">{T('Буква «ن»')}</option>
              <option value="landscape">{T('Пейзаж')}</option>
            </select>
          </Field>
          <Field label={T('Формат времени')} id="s-tf">
            <select id="s-tf" className="input" value={f.timeFormat} onChange={(e) => set('timeFormat', e.target.value)}>
              <option value="24">{T('24 часа (14:30)')}</option><option value="12">{T('12 часов (2:30 PM)')}</option>
            </select>
          </Field>
          <Field label={T('Приветствие: заголовок')} error={errors.greetTitle} id="s-gt"><input id="s-gt" className="input" value={f.greetTitle} onChange={(e) => set('greetTitle', e.target.value)} maxLength={80} /></Field>
          <Field label={T('Приветствие: текст')} error={errors.greetText} id="s-gx"><input id="s-gx" className="input" value={f.greetText} onChange={(e) => set('greetText', e.target.value)} maxLength={200} /></Field>
          <Field label={T('Часовой пояс')} error={errors.timeZone} hint={T('Сейчас там: {0}. День определяется по этому поясу.', fmtTime(zonedParts(Date.now(), isValidTimeZone(f.timeZone) ? f.timeZone : 'UTC').minutes))} id="s-tz">
            <input id="s-tz" className="input" list="zones" value={f.timeZone} onChange={(e) => set('timeZone', e.target.value)} />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <Field label={T('Начало недели')} id="s-ws">
            <select id="s-ws" className="input" value={f.weekStart} onChange={(e) => set('weekStart', e.target.value)}>
              <option value="1">{T('Понедельник')}</option><option value="0">{T('Воскресенье')}</option>
            </select>
          </Field>
          <Field label={T('Рабочий день: начало')} error={errors.dayStart} id="s-ds"><input id="s-ds" type="time" className="input" value={f.dayStart} onChange={(e) => set('dayStart', e.target.value)} /></Field>
          <Field label={T('Рабочий день: конец')} error={errors.dayEnd} id="s-de"><input id="s-de" type="time" className="input" value={f.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} /></Field>
          <Field label={T('Pomodoro: работа, мин')} error={errors.pomodoroWork} id="s-pw"><input id="s-pw" type="number" min={1} max={180} className="input" value={f.pomodoroWork} onChange={(e) => set('pomodoroWork', e.target.value)} /></Field>
          <Field label={T('Pomodoro: отдых, мин')} error={errors.pomodoroBreak} id="s-pb"><input id="s-pb" type="number" min={1} max={60} className="input" value={f.pomodoroBreak} onChange={(e) => set('pomodoroBreak', e.target.value)} /></Field>
          <Field label={T('Лимит компенсации нормы, %')} error={errors.maxCarry} hint={T('Сколько максимум можно добавить к дневной норме из вчерашнего долга')} id="s-mc"><input id="s-mc" type="number" min={0} max={200} className="input" value={f.maxCarry} onChange={(e) => set('maxCarry', e.target.value)} /></Field>
        </div>
        <button className="btn btn-primary justify-self-end">{T('Сохранить')}</button>
      </form>

      <section className="card grid gap-4">
        <h2 className="h2">{T('Главная страница')}</h2>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span><span className="block font-semibold">{T('Аят или хадис дня')}</span><span className="block text-xs text-muted">{T('Только проверенные тексты с указанием источника и смысловым переводом.')}</span></span>
          <Switch checked={settings.showReminder} onChange={() => saveSettings({ showReminder: !settings.showReminder })} label={T('Аят или хадис дня')} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span><span className="block font-semibold">{T('Дата по хиджре')}</span><span className="block text-xs text-muted">{T('Календарь')}{' '}{HIJRI_METHOD}{T('; возможна разница ±1 день с местным началом месяца.')}</span></span>
          <Switch checked={settings.showHijri} onChange={() => saveSettings({ showHijri: !settings.showHijri })} label={T('Дата по хиджре')} />
        </label>
      </section>

      <section className="card grid gap-3">
        <h2 className="h2">{T('Установка приложения')}</h2>
        {isStandalone() ? <p className="muted">{T('НИЗАМ уже установлен и открыт как приложение.')}</p> : (
          <>
            <p className="muted">{T('НИЗАМ можно установить на телефон или компьютер — он откроется без браузерных панелей и будет работать без интернета.')}</p>
            {canInstall
              ? <button className="btn btn-primary justify-self-start" onClick={async () => { if (await install()) toast(T('Приложение установлено')); }}><MonitorSmartphone size={18} />{T('Установить НИЗАМ')}</button>
              : <p className="text-[13px] text-muted">{T('iPhone/iPad (Safari): «Поделиться» → «На экран „Домой“». Android/Chrome/Edge: меню браузера → «Установить приложение». Кнопка появится здесь, когда браузер разрешит установку.')}</p>}
          </>
        )}
      </section>

      <section className="card grid gap-3">
        <h2 className="h2">{T('Уведомления')}</h2>
        <p className="muted">{T('Напоминание за 5 минут до начала задачи и сигнал по окончании периода Pomodoro — пока приложение открыто. Фоновую доставку при закрытом браузере веб-приложение гарантировать не может, особенно на iPhone.')}</p>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="font-semibold">{T('Системные уведомления')}</span>
          <Switch checked={settings.notifications} label={T('Системные уведомления')} onChange={async () => {
            const on = !settings.notifications;
            if (on) {
              if (!('Notification' in window)) { toast(T('Этот браузер не поддерживает уведомления'), 'error'); return; }
              if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') { toast(T('Браузер не разрешил уведомления'), 'error'); return; }
              }
            }
            await saveSettings({ notifications: on });
          }} />
        </label>
      </section>

      <section className="card grid gap-3">
        <h2 className="h2">{T('Резервная копия')}</h2>
        <p className="muted">{T('Данные хранятся только в этом браузере (IndexedDB) и работают без интернета. Регулярно сохраняйте копию в файл — например, раз в неделю — и храните её в облаке или на другом устройстве. Последняя копия:')}{' '}{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('ru-RU') : T('ещё не создавалась')}.
        </p>
        <p className="text-sm">{T('В базе: задач')}{' '}{tasks.length}{T(', сеансов')}{' '}{sessions.length}{T(', привычек')}{' '}{habits.length}{T(', направлений')}{' '}{areas.length}{T(', целей')}{' '}{goals.length}.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={doExport}><Download size={18} />{T('Экспорт в JSON')}</button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={18} />{T('Импорт из JSON')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label={T('Файл резервной копии')} onChange={(e) => { const file = e.target.files?.[0]; if (file) doImport(file); }} />
        </div>
      </section>

      <section className="card grid gap-3 border-danger/40">
        <h2 className="h2 text-danger">{T('Опасная зона')}</h2>
        <p className="muted">{T('Удаление всех задач, привычек, направлений, целей, сеансов и обзоров. Настройки сохранятся. Действие необратимо.')}</p>
        <button className="btn btn-danger justify-self-start" onClick={async () => {
          const ok = await confirm({ title: T('Удалить все данные?'), message: T('Это действие нельзя отменить. Сначала сделайте экспорт, если данные нужны.'), confirmText: T('Удалить всё'), danger: true });
          if (ok) { await clearAll(true); toast(T('Все данные удалены')); }
        }}><Trash2 size={18} />{T('Удалить все данные')}</button>
      </section>

      <p className="text-center text-xs text-muted">{T('НИЗАМ')}{' '}<span className="arabic" lang="ar">نِظَام</span>{' '}{T('v2.0 · локальное хранение · без платных API')}</p>
    </div>
  );
}
