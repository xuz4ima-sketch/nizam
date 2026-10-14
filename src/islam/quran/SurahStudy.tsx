import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Bookmark, BookmarkCheck, BookOpen, ChevronLeft, ChevronRight, Copy, Pause, Play, Repeat, Settings2, Square,
} from 'lucide-react';
import { useUI } from '../../components/ui';
import { getLang, t } from '../../i18n';
import { arabicDigits, cachedJSON, sanitizeHTML, useLoad, usePref } from '../content';
import { ErrorBlock, FontStepper, LoadingBlock, SourceNote, Toggle } from '../ui';
import {
  API, getChapters, getSurahAudio, getSurahTafsir, getSurahVerses, plainTranslation, TAFSIRS, TRANSLATIONS, type TafsirKey,
} from './api';
import { QURAN_PREF, type QuranPref } from './prefs';

export default function SurahStudy() {
  const { id } = useParams();
  const ch = Math.min(114, Math.max(1, Number(id) || 1));
  const [sp] = useSearchParams();
  const startAyah = Number(sp.get('a')) || 0;
  const nav = useNavigate();
  const { toast } = useUI();
  const lang = getLang();
  const [pref, setPref] = usePref<QuranPref>('quran', QURAN_PREF);
  const trId = lang === 'en' ? TRANSLATIONS.en : lang === 'ru' ? TRANSLATIONS.ru : undefined;
  const chapters = useLoad(`chapters:${lang}`, () => getChapters(lang));
  const verses = useLoad(`surah:${ch}:${trId ?? 0}`, () => getSurahVerses(ch, trId));
  const tafsirKey: TafsirKey = pref.tafsir;
  const tafsir = useLoad(pref.showTafsir ? `tafsir:${ch}:${tafsirKey}` : null, () => getSurahTafsir(ch, TAFSIRS[tafsirKey].id));
  const basmala = useLoad('basmala', () => cachedJSON<{ verse: { text_uthmani: string } }>(`${API}/verses/by_key/1:1?fields=text_uthmani`).then((d) => d.verse.text_uthmani));
  const [panel, setPanel] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const chapter = chapters.data?.find((c) => c.id === ch);
  const tafsirMap = useMemo(() => new Map((tafsir.data ?? []).map((r) => [r.verse_key, r.text])), [tafsir.data]);

  // Аудио: последовательное чтение с повтором аята.
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrls = useRef<Map<string, string> | null>(null);
  const [playing, setPlaying] = useState<{ key: string; paused: boolean } | null>(null);
  const repeatLeft = useRef(0);
  const continuous = useRef(true);

  useEffect(() => () => { audio.current?.pause(); }, []);
  useEffect(() => { audio.current?.pause(); setPlaying(null); audioUrls.current = null; }, [ch]);

  async function play(key: string, cont = true) {
    try {
      if (!audioUrls.current) audioUrls.current = await getSurahAudio(ch);
      const url = audioUrls.current.get(key);
      if (!url) { toast(t('Аудио для этого аята недоступно'), 'error'); return; }
      if (!audio.current) {
        audio.current = new Audio();
        audio.current.addEventListener('ended', () => endedRef.current());
      }
      continuous.current = cont;
      if (repeatLeft.current <= 0) repeatLeft.current = pref.repeat;
      audio.current.src = url;
      await audio.current.play();
      setPlaying({ key, paused: false });
      document.getElementById(`ayah-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      toast(e instanceof Error && e.name === 'NotAllowedError' ? t('Браузер заблокировал звук — нажмите ещё раз') : t('Не удалось воспроизвести аудио. Проверьте подключение к интернету.'), 'error');
      setPlaying(null);
    }
  }
  function onEnded() {
    setPlaying((cur) => {
      if (!cur) return cur;
      if (repeatLeft.current > 0) { repeatLeft.current--; audio.current?.play().catch(() => {}); return cur; }
      const list = verses.data ?? [];
      const i = list.findIndex((v) => v.verse_key === cur.key);
      if (continuous.current && i >= 0 && i + 1 < list.length) { repeatLeft.current = 0; setTimeout(() => play(list[i + 1].verse_key, true), 250); return cur; }
      return null;
    });
  }
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded; // всегда актуальные данные суры и настройки повтора
  function stop() { audio.current?.pause(); repeatLeft.current = 0; setPlaying(null); }
  function togglePause() {
    if (!audio.current || !playing) return;
    if (playing.paused) { audio.current.play().catch(() => {}); setPlaying({ ...playing, paused: false }); }
    else { audio.current.pause(); setPlaying({ ...playing, paused: true }); }
  }

  // Прокрутка к нужному аяту и запоминание места чтения.
  useEffect(() => {
    if (!verses.data || !startAyah) return;
    setTimeout(() => document.getElementById(`ayah-${ch}:${startAyah}`)?.scrollIntoView({ block: 'center' }), 60);
  }, [verses.data, startAyah, ch]);
  useEffect(() => {
    if (!verses.data) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.ayah));
      if (vis.length) setPref({ lastSurah: ch, lastAyah: Math.min(...vis) });
    }, { rootMargin: '-40% 0px -50% 0px' });
    document.querySelectorAll('[data-ayah]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [verses.data, ch]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOpen = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const tafsirRtl = TAFSIRS[tafsirKey].lang === 'ar';

  return (
    <div className="fade-in">
      {/* Заголовок суры */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/quran" className="btn btn-ghost btn-icon" aria-label={t('К списку сур')}><ChevronRight size={20} className="ltr:rotate-180" /></Link>
          <div>
            <h1 className="h1">{chapter ? `${chapter.id}. ${lang === 'ar' ? `سورة ${chapter.name_arabic}` : chapter.name_simple}` : t('Сура {0}', ch)}</h1>
            {chapter && <p className="text-[13px] text-muted">{lang === 'ar' ? '' : `${chapter.translated_name.name} · `}{t('аятов: {0}', chapter.verses_count)} · {chapter.revelation_place === 'makkah' ? t('мекканская') : t('мединская')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {chapter && <Link to={`/quran/page/${chapter.pages[0]}`} className="btn btn-outline"><BookOpen size={17} />{t('Мусхаф')}</Link>}
          <button className="btn btn-primary" onClick={() => (playing ? stop() : verses.data?.[0] && play(startAyah ? `${ch}:${startAyah}` : verses.data[0].verse_key))}>
            {playing ? <Square size={16} /> : <Play size={16} />}{playing ? t('Остановить') : t('Слушать суру')}
          </button>
          <button className="btn btn-outline btn-icon" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={t('Настройки чтения')}><Settings2 size={18} /></button>
        </div>
      </div>

      {/* Панель настроек */}
      {panel && (
        <section className="card fade-in mb-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <FontStepper label={t('Коран')} value={pref.arFont} min={20} max={64} onChange={(v) => setPref({ arFont: v })} />
            {trId && <FontStepper label={t('Перевод')} value={pref.trFont} min={12} max={34} onChange={(v) => setPref({ trFont: v })} />}
            <FontStepper label={t('Тафсир')} value={pref.tafsirFont} min={12} max={34} onChange={(v) => setPref({ tafsirFont: v })} />
          </div>
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap gap-2">
              {trId && <Toggle on={pref.showTranslation} onChange={(v) => setPref({ showTranslation: v })}>{t('Перевод смыслов')}</Toggle>}
              <Toggle on={pref.showTafsir} onChange={(v) => setPref({ showTafsir: v })}>{t('Тафсир')}</Toggle>
              <Toggle on={pref.expandTafsir} onChange={(v) => setPref({ expandTafsir: v })}>{t('Раскрыть весь тафсир')}</Toggle>
            </div>
            <label className="grid gap-1 text-[13px] font-semibold">{t('Тафсир')}
              <select className="input" value={tafsirKey} onChange={(e) => setPref({ tafsir: e.target.value as TafsirKey })}>
                {(Object.keys(TAFSIRS) as TafsirKey[]).map((k) => <option key={k} value={k}>{t(TAFSIRS[k].name)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">{t('Повтор аята при прослушивании (заучивание)')}
              <select className="input" value={pref.repeat} onChange={(e) => setPref({ repeat: Number(e.target.value) })}>
                {[0, 1, 2, 4, 6, 9].map((n) => <option key={n} value={n}>{n === 0 ? t('Без повтора') : t('Ещё {0} раз', n)}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {verses.error && <ErrorBlock error={verses.error} onRetry={verses.reload} />}
      {verses.loading && <LoadingBlock />}

      {verses.data && (
        <>
          {ch !== 1 && ch !== 9 && basmala.data && <p className="quran mb-4 text-center text-accent-strong dark:text-gold" style={{ fontSize: pref.arFont }} lang="ar" dir="rtl">{basmala.data}</p>}
          <ol className="grid gap-3">
            {verses.data.map((v) => {
              const tr = v.translations?.[0]?.text;
              const taf = tafsirMap.get(v.verse_key);
              const isOpen = pref.expandTafsir || open.has(v.verse_key);
              const isPlaying = playing?.key === v.verse_key;
              const marked = pref.ayahMarks.includes(v.verse_key);
              return (
                <li key={v.verse_key} id={`ayah-${v.verse_key}`} data-ayah={v.verse_number}
                  className={`card scroll-mt-24 !p-4 transition-colors sm:!p-5 ${isPlaying ? 'border-gold/60 bg-gold-soft/40' : ''}`}>
                  <div className="mb-2 flex items-center gap-1">
                    <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-accent-soft px-2 text-[12px] font-extrabold tabular-nums text-accent">{v.verse_key}</span>
                    <span className="flex-1" />
                    <button className="btn btn-ghost btn-icon !min-h-9 !min-w-9 text-muted" onClick={() => (isPlaying ? togglePause() : play(v.verse_key, false))}
                      aria-label={isPlaying ? (playing?.paused ? t('Продолжить') : t('Пауза')) : t('Слушать аят {0}', v.verse_key)}>
                      {isPlaying && !playing?.paused ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                    {pref.repeat > 0 && <Repeat size={14} className="text-gold" aria-label={t('Повтор включён')} />}
                    <button className="btn btn-ghost btn-icon !min-h-9 !min-w-9 text-muted" aria-label={t('Копировать аят')}
                      onClick={() => navigator.clipboard?.writeText(`${v.text_uthmani}\n${tr ? plainTranslation(tr) + '\n' : ''}(${chapter?.name_simple ?? ''} ${v.verse_key})`).then(() => toast(t('Скопировано')), () => toast(t('Не удалось скопировать'), 'error'))}>
                      <Copy size={16} />
                    </button>
                    <button className="btn btn-ghost btn-icon !min-h-9 !min-w-9" aria-pressed={marked} aria-label={marked ? t('Убрать закладку') : t('Добавить закладку')}
                      onClick={() => setPref({ ayahMarks: marked ? pref.ayahMarks.filter((k) => k !== v.verse_key) : [v.verse_key, ...pref.ayahMarks].slice(0, 100) })}>
                      {marked ? <BookmarkCheck size={17} className="text-gold" /> : <Bookmark size={17} className="text-muted" />}
                    </button>
                  </div>
                  <p className="quran text-right" style={{ fontSize: pref.arFont }} lang="ar" dir="rtl">
                    {v.text_uthmani} <span className="ayah-end">{'۝'}{arabicDigits(v.verse_number)}</span>
                  </p>
                  {trId && pref.showTranslation && tr && (
                    <p className="mt-3 leading-relaxed text-fg/90" style={{ fontSize: pref.trFont }}>{plainTranslation(tr)}</p>
                  )}
                  {pref.showTafsir && (
                    <div className="mt-3 border-t border-line pt-2">
                      {!pref.expandTafsir && (
                        <button className="text-[13px] font-semibold text-accent hover:underline" onClick={() => toggleOpen(v.verse_key)} aria-expanded={isOpen}>
                          {isOpen ? t('Скрыть тафсир') : t('Тафсир: {0}', t(TAFSIRS[tafsirKey].name))}
                        </button>
                      )}
                      {isOpen && (tafsir.loading ? <div className="skeleton mt-2 h-16" /> : tafsir.error ? (
                        <p className="mt-2 text-[13px] text-danger">{tafsir.error}</p>
                      ) : taf ? (
                        <div className="tafsir mt-2 leading-relaxed text-fg/90" style={{ fontSize: pref.tafsirFont }} dir={tafsirRtl ? 'rtl' : 'auto'} lang={tafsirRtl ? 'ar' : undefined}
                          // Текст тафсира очищается: допускается только разметка абзацев и выделений.
                          dangerouslySetInnerHTML={{ __html: sanitizeHTML(taf) }} />
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">{t('В этом тафсире толкование дано вместе с соседними аятами.')}</p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <nav className="mt-6 flex justify-between gap-2" aria-label={t('Соседние суры')}>
            <button className="btn btn-outline min-w-0 flex-1 whitespace-normal !text-[13px] sm:flex-none" disabled={ch <= 1} onClick={() => nav(`/quran/surah/${ch - 1}`)}><ChevronRight size={17} className="ltr:rotate-180" />{t('Предыдущая сура')}</button>
            <button className="btn btn-outline min-w-0 flex-1 whitespace-normal !text-[13px] sm:flex-none" disabled={ch >= 114} onClick={() => nav(`/quran/surah/${ch + 1}`)}>{t('Следующая сура')}<ChevronLeft size={17} className="ltr:rotate-180" /></button>
          </nav>
        </>
      )}
      {playing && (
        <div className="safe-bottom fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-brand-900 px-3 py-2 text-white shadow-[var(--shadow-lg)] lg:bottom-4">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t('Чтение: аль-Афаси · аят {0}', playing.key)}</span>
          <button className="btn btn-ghost btn-icon !text-white" onClick={togglePause} aria-label={playing.paused ? t('Продолжить') : t('Пауза')}>{playing.paused ? <Play size={18} /> : <Pause size={18} />}</button>
          <button className="btn btn-ghost btn-icon !text-white" onClick={stop} aria-label={t('Остановить')}><Square size={17} /></button>
        </div>
      )}
      <SourceNote>{t('Перевод смыслов: Э. Кулиев (рус.), Saheeh International (англ.). Тафсир: ас-Саади (рус./араб.), аль-Муяссар (араб.). Источник: Quran.com API.')}</SourceNote>
    </div>
  );
}
