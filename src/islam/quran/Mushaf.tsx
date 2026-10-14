import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Expand, Languages, Minimize, Moon, Settings2, Sun, X,
} from 'lucide-react';
import { saveSettings } from '../../db/repo';
import { getLang, t } from '../../i18n';
import { useIsDark } from '../../components/charts';
import { arabicDigits, cachedJSON, useLoad, usePref } from '../content';
import { ErrorBlock, FontStepper } from '../ui';
import { API, getChapters, getPage, JUZ_PAGES, PAGES, type Chapter, type Verse } from './api';
import { QURAN_PREF, type QuranPref } from './prefs';

/** Басмала берётся из текста Корана (1:1), а не набирается вручную. */
const getBasmala = () => cachedJSON<{ verse: { text_uthmani: string } }>(`${API}/verses/by_key/1:1?fields=text_uthmani`).then((d) => d.verse.text_uthmani);

export default function Mushaf() {
  const params = useParams();
  const nav = useNavigate();
  const page = Math.min(PAGES, Math.max(1, Number(params.page) || 1));
  const [pref, setPref] = usePref<QuranPref>('quran', QURAN_PREF);
  const lang = getLang();
  const chapters = useLoad(`chapters:${lang}`, () => getChapters(lang));
  const data = useLoad(`page:${page}`, () => getPage(page));
  const basmala = useLoad('basmala', getBasmala);
  const [bars, setBars] = useState(true);
  const [panel, setPanel] = useState(false);
  const [fs, setFs] = useState(false);
  const dark = useIsDark();
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const go = (p: number) => { if (p >= 1 && p <= PAGES && p !== page) nav(`/quran/page/${p}`, { replace: true }); };

  // Запомнить страницу, подгрузить соседние, прокрутить вверх.
  useEffect(() => {
    if (pref.lastPage !== page) setPref({ lastPage: page });
    scroller.current?.scrollTo({ top: 0 });
    if (page < PAGES) getPage(page + 1).catch(() => {});
    if (page > 1) getPage(page - 1).catch(() => {});
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Клавиатура: в мусхафе следующая страница — слева.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') go(page + 1);
      if (e.key === 'ArrowRight') go(page - 1);
      if (e.key === 'Escape' && !document.fullscreenElement) nav('/quran');
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  async function toggleFs() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* iOS Safari не поддерживает полноэкранный режим для страниц — остаётся режим без панелей */ setBars(false); }
  }

  const verses = data.data ?? [];
  const onPage = useMemo(() => {
    const ids = [...new Set(verses.map((v) => Number(v.verse_key.split(':')[0])))];
    return ids.map((id) => chapters.data?.find((c) => c.id === id)).filter(Boolean) as Chapter[];
  }, [verses, chapters.data]);
  const juz = verses[0]?.juz_number ?? (JUZ_PAGES.filter((p) => p <= page).length);
  const marked = pref.pageMarks.includes(page);

  return createPortal(
    <div className="fade fixed inset-0 z-[56] flex flex-col bg-bg text-fg" role="dialog" aria-modal="true" aria-label={t('Мусхаф, страница {0}', page)}>
      {/* верхняя панель */}
      <header className={`safe-top z-10 border-b border-line bg-card/95 backdrop-blur transition-transform duration-200 ${bars ? '' : '-translate-y-full'} absolute inset-x-0 top-0`}>
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-1 px-2 sm:px-4">
          <button className="btn btn-ghost btn-icon" onClick={() => nav('/quran')} aria-label={t('Закрыть Мусхаф')}><X size={20} /></button>
          <div className="min-w-0 flex-1 px-1 text-center">
            <p className="truncate text-[13px] font-bold">{onPage.map((c) => c.name_simple).join(' · ') || t('Мусхаф')}</p>
            <p className="text-[11.5px] text-muted">{t('Страница {0} · Джуз {1}', page, juz)}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setPref({ pageMarks: marked ? pref.pageMarks.filter((p) => p !== page) : [page, ...pref.pageMarks].slice(0, 50) })}
            aria-pressed={marked} aria-label={marked ? t('Убрать закладку') : t('Добавить закладку')}>
            {marked ? <BookmarkCheck size={20} className="text-gold" /> : <Bookmark size={20} />}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={t('Настройки чтения')}><Settings2 size={20} /></button>
          <button className="btn btn-ghost btn-icon hidden sm:inline-flex" onClick={toggleFs} aria-label={fs ? t('Выйти из полноэкранного режима') : t('На весь экран')}>{fs ? <Minimize size={20} /> : <Expand size={20} />}</button>
        </div>
        {panel && (
          <div className="mx-auto grid max-w-4xl gap-3 border-t border-line px-4 py-3 sm:grid-cols-2">
            <FontStepper label={t('Размер текста Корана')} value={pref.mushafFont} min={18} max={64} onChange={(v) => setPref({ mushafFont: v })} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => saveSettings({ theme: dark ? 'light' : 'dark' })}>{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? t('Дневной режим') : t('Ночной режим')}</button>
              <button className="btn btn-outline btn-sm" onClick={toggleFs}><Expand size={15} />{fs ? t('Обычный экран') : t('На весь экран')}</button>
              {onPage[0] && <button className="btn btn-soft btn-sm" onClick={() => nav(`/quran/surah/${onPage[0].id}?a=${verses.find((v) => v.verse_key.startsWith(onPage[0].id + ':'))?.verse_number ?? 1}`)}><Languages size={15} />{t('С переводом и тафсиром')}</button>}
            </div>
            <JumpBar page={page} chapters={chapters.data ?? []} go={go} />
          </div>
        )}
      </header>

      {/* страница */}
      <div ref={scroller} className="thin-scroll flex-1 overflow-y-auto"
        onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, select')) { setBars((b) => !b); setPanel(false); } }}
        onTouchStart={(e) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY, t: Date.now() }; }}
        onTouchEnd={(e) => {
          const s = touch.current; touch.current = null;
          if (!s) return;
          const p = e.changedTouches[0];
          const dx = p.clientX - s.x, dy = p.clientY - s.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) go(dx > 0 ? page + 1 : page - 1);
        }}>
        <div className="mx-auto max-w-3xl px-3 pb-28 pt-[calc(72px+env(safe-area-inset-top))] sm:px-6">
          {data.error ? <ErrorBlock error={data.error} onRetry={data.reload} /> : (
            <article className="mushaf-paper relative rounded-[20px] border-2 border-gold/40 px-4 py-6 shadow-[var(--shadow)] sm:px-10 sm:py-8">
              <div className="pointer-events-none absolute inset-1.5 rounded-[15px] border border-gold/25" aria-hidden />
              <div className="mb-3 flex items-center justify-between text-[12px] font-semibold text-gold" dir="rtl" lang="ar">
                <span className="quran text-[16px]">{onPage.map((c) => `سورة ${c.name_arabic}`).join('، ')}</span>
                <span className="quran text-[16px]">الجزء {arabicDigits(juz)}</span>
              </div>
              {data.loading && !verses.length ? (
                <div className="grid gap-4 py-6">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-8" />)}</div>
              ) : (
                <PageText verses={verses} chapters={chapters.data ?? []} basmala={basmala.data} size={pref.mushafFont} />
              )}
              <p className="mt-4 text-center text-[13px] font-bold text-gold tabular-nums">{arabicDigits(page)}</p>
            </article>
          )}
        </div>
      </div>

      {/* нижняя панель */}
      <footer className={`safe-bottom absolute inset-x-0 bottom-0 border-t border-line bg-card/95 backdrop-blur transition-transform duration-200 ${bars ? '' : 'translate-y-full'}`}>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-2" dir="ltr">
          <button className="btn btn-outline btn-icon" onClick={() => go(page + 1)} disabled={page >= PAGES} aria-label={t('Следующая страница')}><ChevronLeft size={20} /></button>
          <input type="range" min={1} max={PAGES} value={page} dir="rtl" onChange={(e) => go(Number(e.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]" aria-label={t('Номер страницы')} />
          <span className="w-14 text-center text-[13px] font-bold tabular-nums">{page}</span>
          <button className="btn btn-outline btn-icon" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t('Предыдущая страница')}><ChevronRight size={20} /></button>
        </div>
      </footer>
      {!bars && (
        <button className="safe-bottom fixed bottom-3 end-3 z-20 grid size-11 place-items-center rounded-full bg-card/90 text-muted shadow-[var(--shadow)]" onClick={() => setBars(true)} aria-label={t('Показать панели')}>
          <ArrowRight size={18} className="-rotate-90" />
        </button>
      )}
    </div>,
    document.body,
  );
}

function JumpBar({ page, chapters, go }: { page: number; chapters: Chapter[]; go: (p: number) => void }) {
  const [p, setP] = useState(String(page));
  useEffect(() => setP(String(page)), [page]);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto]">
      <select className="input" aria-label={t('Перейти к суре')} value="" onChange={(e) => { const c = chapters.find((x) => x.id === Number(e.target.value)); if (c) go(c.pages[0]); }}>
        <option value="">{t('Перейти к суре…')}</option>
        {chapters.map((c) => <option key={c.id} value={c.id}>{c.id}. {c.name_simple} — {c.name_arabic}</option>)}
      </select>
      <select className="input hidden sm:block" aria-label={t('Перейти к джузу')} value="" onChange={(e) => go(Number(e.target.value))}>
        <option value="">{t('Перейти к джузу…')}</option>
        {JUZ_PAGES.map((pg, i) => <option key={i} value={pg}>{t('Джуз {0}', i + 1)}</option>)}
      </select>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const n = Number(p); if (n >= 1 && n <= PAGES) go(n); }}>
        <input className="input w-20" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ''))} aria-label={t('Номер страницы')} />
        <button className="btn btn-primary btn-sm !min-h-10">{t('Перейти')}</button>
      </form>
    </div>
  );
}

/** Текст страницы: заголовки сур, басмала, аяты с номерами в знаке конца аята. */
function PageText({ verses, chapters, basmala, size }: { verses: Verse[]; chapters: Chapter[]; basmala?: string; size: number }) {
  const blocks: { surah?: Chapter; showBasmala?: boolean; verses: Verse[] }[] = [];
  for (const v of verses) {
    const [s, a] = v.verse_key.split(':').map(Number);
    if (a === 1 || !blocks.length) {
      const c = chapters.find((x) => x.id === s);
      blocks.push({ surah: a === 1 ? c : undefined, showBasmala: a === 1 && s !== 1 && s !== 9, verses: [] });
    }
    blocks[blocks.length - 1].verses.push(v);
  }
  return (
    <div dir="rtl" lang="ar">
      {blocks.map((b, i) => (
        <section key={i}>
          {b.surah && (
            <div className="my-4 rounded-xl border border-gold/40 bg-gold-soft/50 py-2 text-center">
              <p className="quran text-[22px] leading-[1.8] text-accent-strong dark:text-gold">سُورَةُ {b.surah.name_arabic}</p>
            </div>
          )}
          {b.showBasmala && basmala && <p className="quran mb-2 text-center" style={{ fontSize: size * 0.92 }}>{basmala}</p>}
          <p className="quran text-justify" style={{ fontSize: size, textAlignLast: 'center' }}>
            {b.verses.map((v) => (
              <span key={v.verse_key}>
                {v.text_uthmani}
                <span className="ayah-end" aria-label={`آية ${v.verse_number}`}>{'۝'}{arabicDigits(v.verse_number)}</span>{' '}
              </span>
            ))}
          </p>
        </section>
      ))}
    </div>
  );
}
