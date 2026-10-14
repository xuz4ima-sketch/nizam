import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check, ChevronRight, Eye, EyeOff, FileAudio, Mic, Pause, Play, Plus, Repeat, Settings2, Square, Trash2, Upload, Volume2,
} from 'lucide-react';
import { ProgressBar, Tabs, useUI } from '../../components/ui';
import { db } from '../../db/db';
import type { MediaItem, MemoEntry } from '../../db/schema';
import { getLang, t } from '../../i18n';
import { useLoad, usePref } from '../content';
import { ErrorBlock, FontStepper, LoadingBlock, SourceNote, Toggle } from '../ui';
import {
  deleteMedia, fileId, playBlob, recId, recordingSupported, saveMedia, speak, startRecording, stopBlob, stopSpeech, ttsSupported,
  useArabicVoices, useObjectUrl, type Recorder,
} from './audio';
import { EN_TITLES, loadText, RU_TITLES, unitText, units, type Item, type TextDoc, type Unit } from './texts';

interface LibPref {
  font: number;
  rate: number;
  voice: string;
  hide: 'none' | 'all' | 'memorized';
  hint: boolean;
  loopReps: number;
  source: 'tts' | 'rec';
  lastSection: Record<string, number>;
}
const LIB_PREF: LibPref = { font: 26, rate: 0.8, voice: '', hide: 'none', hint: true, loopReps: 3, source: 'tts', lastSection: {} };

export default function TextReader() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const mode = sp.get('m') === 'learn' ? 'learn' : 'read';
  const doc = useLoad(`text:${id}`, () => loadText(id));
  const [pref, setPref] = usePref<LibPref>('library', LIB_PREF);
  const [panel, setPanel] = useState(false);
  const lang = getLang();

  if (doc.error) return <ErrorBlock error={doc.error === 'not-found' ? t('Текст не найден') : doc.error} onRetry={doc.reload} />;
  if (!doc.data) return <LoadingBlock />;
  const d = doc.data;

  return (
    <div className="fade-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Link to={mode === 'learn' ? '/mutun' : '/library'} className="btn btn-ghost btn-icon" aria-label={t('Назад к списку')}><ChevronRight size={20} className="ltr:rotate-180" /></Link>
          <div className="min-w-0">
            <h1 className="matn text-[28px] font-bold leading-snug text-accent-strong dark:text-fg" lang="ar" dir="rtl">{d.title}</h1>
            <p className="text-[13px] text-muted">{lang === 'ru' ? RU_TITLES[d.id] : lang === 'en' ? EN_TITLES[d.id] : ''}{lang !== 'ar' && ' · '}<span lang="ar">{d.author}</span></p>
            {d.vocalized === false && <p className="mt-1 text-[12px] text-warn">{t('В источнике этот текст без огласовки (харакатов).')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs label={t('Режим')} value={mode} onChange={(m) => setSp(m === 'learn' ? { m } : {}, { replace: true })} items={[['read', t('Чтение')], ['learn', t('Заучивание')]]} />
          <button className="btn btn-outline btn-icon" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={t('Настройки чтения')}><Settings2 size={18} /></button>
        </div>
      </div>

      {panel && <SettingsPanel pref={pref} setPref={setPref} doc={d} />}
      {mode === 'read' ? <ReadView doc={d} pref={pref} setPref={setPref} /> : <LearnView doc={d} pref={pref} setPref={setPref} />}

      <SourceNote>
        {t('Источник: {0}, страница «{1}», версия {2}. Лицензия {3}.', d.source.name, d.source.page, d.source.revid, d.source.license)}{' '}
        <a href={d.source.url} target="_blank" rel="noreferrer" className="link">{t('Открыть источник')}</a>
      </SourceNote>
    </div>
  );
}

/* ---------- Настройки ---------- */
function SettingsPanel({ pref, setPref, doc }: { pref: LibPref; setPref: (p: Partial<LibPref>) => void; doc: TextDoc }) {
  const voices = useArabicVoices();
  return (
    <section className="card fade-in mb-4 grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <FontStepper label={t('Размер арабского текста')} value={pref.font} min={16} max={56} onChange={(v) => setPref({ font: v })} />
        <label className="grid gap-1 text-[13px] font-semibold">{t('Перейти к разделу')}
          <select className="input" value="" onChange={(e) => document.getElementById(`sec-${e.target.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <option value="">{t('Оглавление…')}</option>
            {doc.sections.map((s, i) => <option key={i} value={i}>{s.title || t('Начало')}</option>)}
          </select>
        </label>
      </div>
      <div className="grid content-start gap-3">
        <p className="text-[13px] font-semibold">{t('Озвучка')}</p>
        {!ttsSupported() ? <p className="text-[12.5px] text-muted">{t('Этот браузер не поддерживает синтез речи.')}</p> : voices.length === 0 ? (
          <p className="text-[12.5px] text-warn">{t('На устройстве не найден арабский голос синтеза речи. Установите арабский голос в настройках системы (Речь / Синтез речи) или используйте свою запись и прикреплённый аудиофайл.')}</p>
        ) : (
          <label className="grid gap-1 text-[13px] font-semibold">{t('Голос устройства')}
            <select className="input" value={pref.voice} onChange={(e) => setPref({ voice: e.target.value })}>
              <option value="">{t('Автоматически')}</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-[13px] font-semibold">{t('Скорость: {0}', pref.rate.toFixed(2))}
          <input type="range" min={0.5} max={1.3} step={0.05} value={pref.rate} onChange={(e) => setPref({ rate: Number(e.target.value) })} className="accent-[var(--accent)]" />
        </label>
        <p className="text-[11.5px] text-muted">{t('Синтез речи — это голос устройства, а не чтение учёного; произношение может быть неточным. Для точного произношения прикрепите запись шейха или своего учителя.')}</p>
      </div>
    </section>
  );
}

/* ---------- Чтение ---------- */
function ReadView({ doc, pref, setPref }: { doc: TextDoc; pref: LibPref; setPref: (p: Partial<LibPref>) => void }) {
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const s = pref.lastSection[doc.id];
    if (s) setTimeout(() => document.getElementById(`sec-${s}`)?.scrollIntoView({ block: 'start' }), 80);
  }, [doc.id, pref.lastSection]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.sec));
      if (vis.length) setPref({ lastSection: { ...pref.lastSection, [doc.id]: Math.min(...vis) } });
    }, { rootMargin: '-10% 0px -80% 0px' });
    document.querySelectorAll('[data-sec]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let n = 0;
  return (
    <article className="mushaf-paper rounded-[20px] border border-gold/30 px-4 py-6 sm:px-8" dir="rtl" lang="ar">
      {doc.sections.map((s, si) => (
        <section key={si} id={`sec-${si}`} data-sec={si} className="scroll-mt-24">
          {s.title && <h2 className="matn my-4 border-b border-gold/30 pb-1 text-center font-bold text-accent-strong dark:text-gold" style={{ fontSize: pref.font * 0.95 }}>{s.title}</h2>}
          {s.items.map((it, i) => { n++; return <ItemView key={i} it={it} n={n} size={pref.font} />; })}
        </section>
      ))}
    </article>
  );
}

function ItemView({ it, n, size, hidden, hint }: { it: Item; n: number; size: number; hidden?: boolean; hint?: boolean }) {
  const numEl = <span className="ms-2 inline-grid min-w-6 place-items-center rounded-full bg-gold-soft px-1 align-middle font-sans text-[11px] font-bold text-[#86672f] dark:text-gold">{n}</span>;
  const mask = (txt: string) => (hidden ? (hint ? `${txt.split(' ')[0]} …` : '…') : txt);
  if (it.t === 'b') {
    return (
      <div className="matn my-1.5 grid gap-x-8 sm:grid-cols-2" style={{ fontSize: size }}>
        <p className="sm:text-start">{numEl}{mask(it.s)}</p>
        <p className="ps-8 sm:ps-0 sm:text-end">{mask(it.a)}</p>
      </div>
    );
  }
  return <p className="matn my-2 text-justify" style={{ fontSize: size }}>{numEl}{mask(it.text)}</p>;
}

/* ---------- Заучивание ---------- */
function LearnView({ doc, pref, setPref }: { doc: TextDoc; pref: LibPref; setPref: (p: Partial<LibPref>) => void }) {
  const { toast } = useUI();
  const all = useMemo(() => units(doc), [doc]);
  const memo = useLiveQuery(() => db.memo.where('textId').equals(doc.id).toArray(), [doc.id]) ?? [];
  const media = useLiveQuery(() => db.media.where('textId').equals(doc.id).toArray(), [doc.id]) ?? [];
  const memoMap = new Map(memo.map((m) => [m.idx, m]));
  const recMap = new Map(media.filter((m) => m.kind === 'recording' && m.idx !== undefined).map((m) => [m.idx as number, m]));
  const file = media.find((m) => m.kind === 'attached');
  const voices = useArabicVoices();
  const voice = voices.find((v) => v.voiceURI === pref.voice) ?? voices[0];
  const [filter, setFilter] = useState<'all' | 'learning' | 'memorized'>('all');
  const [reveal, setReveal] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<{ idx: number; kind: 'tts' | 'rec' | 'play' } | null>(null);
  const [loop, setLoop] = useState<{ from: number; to: number; running: boolean; cur?: number; rep?: number }>({ from: 1, to: Math.min(all.length, 5), running: false });
  const stopRef = useRef(false);
  const recorder = useRef<Recorder | null>(null);

  useEffect(() => () => { stopSpeech(); stopBlob(); stopRef.current = true; }, []);

  const done = memo.filter((m) => m.status === 'memorized').length;
  const shown = all.filter((u) => filter === 'all' || (filter === 'memorized' ? memoMap.get(u.idx)?.status === 'memorized' : memoMap.get(u.idx)?.status !== 'memorized'));

  async function setMemo(u: Unit, patch: Partial<MemoEntry>) {
    const cur = memoMap.get(u.idx);
    await db.memo.put({ id: `${doc.id}|${u.idx}`, textId: doc.id, idx: u.idx, status: cur?.status ?? 'learning', reps: cur?.reps ?? 0, ...patch, updatedAt: Date.now() });
  }

  async function sayUnit(u: Unit, source = pref.source) {
    const rec = recMap.get(u.idx);
    if (source === 'rec' && rec) await playBlob(rec.blob, 1);
    else await speak(unitText(u.item), { rate: pref.rate, voice });
  }

  async function speakOne(u: Unit) {
    if (busy) { stopSpeech(); stopBlob(); setBusy(null); return; }
    if (!voice && ttsSupported()) toast(t('Арабский голос не найден — будет использован голос по умолчанию'), 'error');
    setBusy({ idx: u.idx, kind: 'tts' });
    try { await speak(unitText(u.item), { rate: pref.rate, voice }); } catch { toast(t('Синтез речи недоступен на этом устройстве'), 'error'); }
    setBusy(null);
  }

  async function toggleRecord(u: Unit) {
    if (busy?.kind === 'rec' && busy.idx === u.idx && recorder.current) {
      const blob = await recorder.current.stop();
      recorder.current = null;
      setBusy(null);
      if (blob.size < 800) { toast(t('Запись слишком короткая'), 'error'); return; }
      await saveMedia({ id: recId(doc.id, u.idx), textId: doc.id, idx: u.idx, kind: 'recording', name: `${doc.id}-${u.idx + 1}`, mime: blob.type, blob });
      toast(t('Запись сохранена'));
      return;
    }
    if (busy) return;
    try {
      recorder.current = await startRecording();
      setBusy({ idx: u.idx, kind: 'rec' });
    } catch { toast(t('Нет доступа к микрофону. Разрешите его в настройках браузера.'), 'error'); }
  }

  async function playRec(r: MediaItem, u: Unit) {
    if (busy) { stopBlob(); setBusy(null); return; }
    setBusy({ idx: u.idx, kind: 'play' });
    try { await playBlob(r.blob); } catch { toast(t('Не удалось воспроизвести запись'), 'error'); }
    setBusy(null);
  }

  async function runLoop() {
    if (loop.running) { stopRef.current = true; stopSpeech(); stopBlob(); setLoop((l) => ({ ...l, running: false, cur: undefined })); return; }
    const from = Math.max(1, Math.min(loop.from, all.length)), to = Math.max(from, Math.min(loop.to, all.length));
    stopRef.current = false;
    setLoop((l) => ({ ...l, from, to, running: true }));
    try {
      for (let i = from - 1; i < to && !stopRef.current; i++) {
        for (let r = 1; r <= pref.loopReps && !stopRef.current; r++) {
          setLoop((l) => ({ ...l, cur: i, rep: r }));
          document.getElementById(`unit-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sayUnit(all[i]);
          await new Promise((res) => setTimeout(res, 500));
        }
        if (!stopRef.current) await setMemo(all[i], { reps: (memoMap.get(i)?.reps ?? 0) + pref.loopReps });
      }
    } catch { toast(t('Озвучка недоступна: нет арабского голоса и своих записей'), 'error'); }
    setLoop((l) => ({ ...l, running: false, cur: undefined }));
  }

  const hiddenFor = (u: Unit) => !reveal.has(u.idx) && (pref.hide === 'all' || (pref.hide === 'memorized' && memoMap.get(u.idx)?.status === 'memorized'));

  return (
    <div className="grid gap-4">
      {/* Прогресс и управление */}
      <section className="card grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-[13px] font-semibold">{t('Выучено {0} из {1}', done, all.length)}</p>
            <ProgressBar value={all.length ? done / all.length : 0} tone="gold" label={t('Прогресс заучивания')} />
          </div>
          <Tabs label={t('Фильтр')} value={filter} onChange={setFilter} items={[['all', t('Все')], ['learning', t('Учу')], ['memorized', t('Выучено')]]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">{t('Проверка памяти:')}</span>
          <Toggle on={pref.hide === 'none'} onChange={() => setPref({ hide: 'none' })}>{t('Показывать всё')}</Toggle>
          <Toggle on={pref.hide === 'memorized'} onChange={() => setPref({ hide: 'memorized' })}>{t('Скрыть выученное')}</Toggle>
          <Toggle on={pref.hide === 'all'} onChange={() => setPref({ hide: 'all' })}>{t('Скрыть всё')}</Toggle>
          <Toggle on={pref.hint} onChange={(v) => setPref({ hint: v })}>{t('Подсказка: первое слово')}</Toggle>
        </div>
        <details className="group rounded-xl bg-card-2 ring-1 ring-line" open={loop.running || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-[13px] font-semibold">
            <Volume2 size={15} className="text-accent" />{t('Аудио и повторение')}
            <span className="ms-auto text-[12px] font-normal text-muted">{file ? t('есть аудиофайл') : ''}</span>
            <ChevronRight size={16} className="text-muted transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" />
          </summary>
          <div className="grid gap-3 border-t border-line p-3">
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-[13px] font-semibold"><Repeat size={15} className="text-accent" />{t('Повторение отрывка')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[12px] text-muted">{t('С')}<input className="input w-20" type="number" min={1} max={all.length} value={loop.from} onChange={(e) => setLoop({ ...loop, from: Number(e.target.value) })} disabled={loop.running} /></label>
            <label className="grid gap-1 text-[12px] text-muted">{t('По')}<input className="input w-20" type="number" min={1} max={all.length} value={loop.to} onChange={(e) => setLoop({ ...loop, to: Number(e.target.value) })} disabled={loop.running} /></label>
            <label className="grid gap-1 text-[12px] text-muted">{t('Повторов')}
              <select className="input w-24" value={pref.loopReps} onChange={(e) => setPref({ loopReps: Number(e.target.value) })} disabled={loop.running}>
                {[1, 2, 3, 5, 7, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] text-muted">{t('Голос')}
              <select className="input" value={pref.source} onChange={(e) => setPref({ source: e.target.value as LibPref['source'] })} disabled={loop.running}>
                <option value="tts">{t('Синтез речи')}</option>
                <option value="rec">{t('Мои записи (где есть)')}</option>
              </select>
            </label>
            <button className={`btn ${loop.running ? 'btn-outline' : 'btn-primary'}`} onClick={runLoop}>{loop.running ? <Square size={16} /> : <Play size={16} />}{loop.running ? t('Стоп') : t('Слушать')}</button>
          </div>
          {loop.running && loop.cur !== undefined && <p className="text-[12.5px] text-muted">{t('Строка {0}, повтор {1} из {2}', loop.cur + 1, loop.rep ?? 1, pref.loopReps)}</p>}
        </div>
        <AttachedAudio textId={doc.id} file={file} />
          </div>
        </details>
      </section>

      {/* Строки */}
      <ol className="grid gap-2">
        {shown.map((u) => {
          const m = memoMap.get(u.idx);
          const rec = recMap.get(u.idx);
          const learned = m?.status === 'memorized';
          const hidden = hiddenFor(u);
          const active = loop.cur === u.idx || busy?.idx === u.idx;
          const title = doc.sections[u.section].title;
          const first = u.idx === 0 || all[u.idx - 1].section !== u.section;
          return (
            <li key={u.idx} id={`unit-${u.idx}`} className="scroll-mt-28">
              {first && title && <p className="matn mb-1 mt-3 text-center text-[17px] font-bold text-accent" lang="ar" dir="rtl">{title}</p>}
              <div className={`card !p-3 transition-colors sm:!p-4 ${active ? 'border-gold/60 bg-gold-soft/40' : learned ? 'border-ok/30' : ''}`}>
                <button className="block w-full text-start" onClick={() => hidden && setReveal((s) => new Set(s).add(u.idx))} aria-label={hidden ? t('Показать строку {0}', u.idx + 1) : undefined}>
                  <div dir="rtl" lang="ar" className={hidden ? 'select-none opacity-60' : ''}>
                    <ItemView it={u.item} n={u.idx + 1} size={pref.font} hidden={hidden} hint={pref.hint} />
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => speakOne(u)} aria-label={t('Озвучить строку {0}', u.idx + 1)}>
                    {busy?.idx === u.idx && busy.kind === 'tts' ? <Square size={14} /> : <Volume2 size={14} />}<span className="hidden sm:inline">{t('Озвучить')}</span>
                  </button>
                  {recordingSupported() && (
                    <button className={`btn btn-sm ${busy?.idx === u.idx && busy.kind === 'rec' ? 'btn-danger' : 'btn-ghost'}`} onClick={() => toggleRecord(u)} aria-label={t('Записать свой голос')}>
                      {busy?.idx === u.idx && busy.kind === 'rec' ? <Square size={14} /> : <Mic size={14} />}<span className="hidden sm:inline">{busy?.idx === u.idx && busy.kind === 'rec' ? t('Стоп') : t('Записать')}</span>
                    </button>
                  )}
                  {rec && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => playRec(rec, u)} aria-label={t('Прослушать свою запись')}>
                        {busy?.idx === u.idx && busy.kind === 'play' ? <Pause size={14} /> : <Play size={14} />}<span className="hidden sm:inline">{t('Моя запись')}</span>
                      </button>
                      <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8 !text-danger" onClick={() => deleteMedia(rec.id)} aria-label={t('Удалить запись')}><Trash2 size={14} /></button>
                    </>
                  )}
                  <span className="flex-1" />
                  <button className="btn btn-ghost btn-sm tabular-nums" onClick={() => setMemo(u, { reps: (m?.reps ?? 0) + 1 })} aria-label={t('Отметить повторение')}>
                    <Plus size={14} />{t('Повторов: {0}', m?.reps ?? 0)}
                  </button>
                  <button className={`btn btn-sm ${learned ? 'btn-primary' : 'btn-soft'}`} aria-pressed={learned} onClick={() => setMemo(u, { status: learned ? 'learning' : 'memorized' })}>
                    <Check size={14} />{learned ? t('Выучено') : t('Отметить выученным')}
                  </button>
                  {hidden ? (
                    <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8" onClick={() => setReveal((s) => new Set(s).add(u.idx))} aria-label={t('Показать')}><Eye size={14} /></button>
                  ) : reveal.has(u.idx) && (
                    <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8" onClick={() => setReveal((s) => { const n = new Set(s); n.delete(u.idx); return n; })} aria-label={t('Скрыть')}><EyeOff size={14} /></button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {!shown.length && <li className="card py-8 text-center text-sm text-muted">{filter === 'memorized' ? t('Пока ничего не отмечено выученным') : t('Всё выучено. Машаллах!')}</li>}
      </ol>
    </div>
  );
}

/** Прикреплённый аудиофайл всего текста (например, запись шейха) с повтором фрагмента A–B и скоростью. */
function AttachedAudio({ textId, file }: { textId: string; file?: MediaItem }) {
  const { toast, confirm } = useUI();
  const url = useObjectUrl(file?.blob);
  const ref = useRef<HTMLAudioElement>(null);
  const [ab, setAb] = useState<{ a?: number; b?: number }>({});
  const [rate, setRate] = useState(1);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate, url]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => { if (ab.a !== undefined && ab.b !== undefined && el.currentTime >= ab.b) el.currentTime = ab.a; };
    el.addEventListener('timeupdate', on);
    return () => el.removeEventListener('timeupdate', on);
  }, [ab, url]);

  async function attach(f: File) {
    if (!f.type.startsWith('audio/')) { toast(t('Выберите аудиофайл (mp3, m4a, ogg…)'), 'error'); return; }
    if (f.size > 150 * 1024 * 1024) { toast(t('Файл больше 150 МБ'), 'error'); return; }
    try {
      await saveMedia({ id: fileId(textId), textId, kind: 'attached', name: f.name, mime: f.type, blob: f });
      toast(t('Аудио прикреплено и сохранено на устройстве'));
    } catch { toast(t('Не удалось сохранить файл: недостаточно места'), 'error'); }
  }
  const fmt = (s?: number) => (s === undefined ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

  return (
    <div className="grid gap-2 rounded-xl bg-card-2 p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold"><FileAudio size={15} className="text-accent" />{t('Аудиозапись текста')}</p>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => input.current?.click()}><Upload size={14} />{file ? t('Заменить') : t('Прикрепить файл')}</button>
          {file && <button className="btn btn-ghost btn-sm !text-danger" onClick={async () => { if (await confirm({ title: t('Удалить аудио?'), confirmText: t('Удалить'), danger: true })) await deleteMedia(file.id); }}><Trash2 size={14} /></button>}
        </div>
        <input ref={input} type="file" accept="audio/*" className="hidden" aria-label={t('Аудиофайл')} onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ''; }} />
      </div>
      {!file ? (
        <p className="text-[12px] text-muted">{t('Прикрепите запись чтения этого текста (например, от вашего учителя или шейха) — она сохранится только на этом устройстве. Затем можно слушать с повтором фрагмента и меньшей скоростью.')}</p>
      ) : (
        <>
          <p className="truncate text-[12px] text-muted">{file.name}</p>
          <audio ref={ref} src={url} controls preload="metadata" className="w-full" />
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <button className="btn btn-outline btn-sm" onClick={() => setAb({ ...ab, a: ref.current?.currentTime })}>A {fmt(ab.a)}</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAb({ ...ab, b: ref.current?.currentTime })}>B {fmt(ab.b)}</button>
            {(ab.a !== undefined || ab.b !== undefined) && <button className="btn btn-ghost btn-sm" onClick={() => setAb({})}>{t('Сбросить A–B')}</button>}
            <label className="flex items-center gap-1">{t('Скорость')}
              <select className="input !min-h-8 w-20 !py-1" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {[0.5, 0.6, 0.75, 0.9, 1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
            {ab.a !== undefined && ab.b !== undefined && ab.b > ab.a && <span className="chip !bg-accent-soft !text-accent">{t('Повтор фрагмента включён')}</span>}
          </div>
        </>
      )}
    </div>
  );
}
