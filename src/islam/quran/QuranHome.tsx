import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookMarked, BookOpen, CloudDownload, Languages, Search, Trash2 } from 'lucide-react';
import { PageHeader, ProgressBar, Tabs, useUI } from '../../components/ui';
import { getLang, t } from '../../i18n';
import { arabicDigits, isCached, useLoad, usePref } from '../content';
import { ErrorBlock, LoadingBlock, SourceNote } from '../ui';
import { getChapters, getPage, JUZ_PAGES, pageUrl, PAGES, type Chapter } from './api';
import { QURAN_PREF, type QuranPref } from './prefs';

export default function QuranHome() {
  const lang = getLang();
  const chapters = useLoad(`chapters:${lang}`, () => getChapters(lang));
  const [pref, setPref] = usePref<QuranPref>('quran', QURAN_PREF);
  const [tab, setTab] = useState<'surah' | 'juz' | 'marks'>('surah');
  const [q, setQ] = useState('');
  const nav = useNavigate();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = chapters.data ?? [];
    if (!s) return all;
    return all.filter((c) => String(c.id) === s || c.name_simple.toLowerCase().includes(s) || c.translated_name.name.toLowerCase().includes(s) || c.name_arabic.includes(q.trim()));
  }, [chapters.data, q]);
  const surahOf = (page: number) => (chapters.data ?? []).filter((c) => c.pages[0] <= page && c.pages[1] >= page);

  return (
    <div className="fade-in grid gap-5">
      <PageHeader title={t('Коран')} subtitle={t('Мусхаф для чтения, перевод смыслов Э. Кулиева и тафсир ас-Саади на русском и арабском.')} />

      <section className="grid gap-4 md:grid-cols-2">
        <button onClick={() => nav(`/quran/page/${pref.lastPage}`)}
          className="group relative overflow-hidden rounded-[22px] bg-brand-900 p-5 text-start text-white transition-transform active:scale-[0.99]">
          <p className="eyebrow !text-gold/90">{t('Продолжить чтение')}</p>
          <p className="mt-2 text-[22px] font-extrabold">{t('Страница {0}', pref.lastPage)}</p>
          <p className="quran mt-1 text-[22px] text-gold" lang="ar" dir="rtl">{surahOf(pref.lastPage).map((c) => c.name_arabic).join(' · ') || 'القرآن الكريم'}</p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-semibold"><BookOpen size={16} />{t('Открыть Мусхаф')}</span>
        </button>
        <Link to={`/quran/surah/${pref.lastSurah}?a=${pref.lastAyah}`}
          className="card group flex flex-col justify-between gap-3 transition-colors hover:border-accent/40">
          <div>
            <p className="eyebrow">{t('С переводом и тафсиром')}</p>
            <p className="mt-2 text-[18px] font-extrabold">
              {chapters.data?.find((c) => c.id === pref.lastSurah)?.translated_name.name ?? t('Сура {0}', pref.lastSurah)}
              <span className="ms-2 text-muted">{t('аят {0}', pref.lastAyah)}</span>
            </p>
            <p className="mt-1 text-[13px] text-muted">{t('Аят за аятом: арабский текст, перевод смыслов, тафсир и чтение аль-Афаси.')}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-semibold text-accent"><Languages size={16} />{t('Открыть')}</span>
        </Link>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label={t('Разделы Корана')} value={tab} onChange={setTab} items={[['surah', t('Суры')], ['juz', t('Джузы')], ['marks', t('Закладки')]]} />
        {tab === 'surah' && (
          <label className="relative w-full sm:w-72">
            <span className="sr-only">{t('Поиск суры')}</span>
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Название или номер суры')} />
          </label>
        )}
      </div>

      {chapters.error && <ErrorBlock error={chapters.error} onRetry={chapters.reload} />}
      {chapters.loading && <LoadingBlock />}

      {tab === 'surah' && chapters.data && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => <SurahRow key={c.id} c={c} />)}
          {!list.length && <li className="col-span-full py-8 text-center text-sm text-muted">{t('Ничего не найдено')}</li>}
        </ul>
      )}

      {tab === 'juz' && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {JUZ_PAGES.map((p, i) => (
            <li key={i}>
              <Link to={`/quran/page/${p}`} className="card flex flex-col items-center gap-1 !p-3 text-center transition-colors hover:border-accent/40">
                <span className="quran text-[20px] leading-none text-accent" lang="ar">الجزء {arabicDigits(i + 1)}</span>
                <span className="text-[12px] text-muted">{t('Джуз {0} · стр. {1}', i + 1, p)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'marks' && <Bookmarks pref={pref} setPref={setPref} chapters={chapters.data ?? []} />}

      <OfflineCard />

      <SourceNote>
        {t('Текст Корана (мединский мусхаф, письмо Усмани), перевод смыслов Э. Кулиева, Saheeh International и тафсиры загружаются из открытого API Quran.com (Quran Foundation). Чтение: Мишари Рашид аль-Афаси. Перевод смыслов не заменяет арабский текст Корана.')}
      </SourceNote>
    </div>
  );
}

function SurahRow({ c }: { c: Chapter }) {
  return (
    <li className="card-flat flex items-center gap-3 p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-[13px] font-extrabold tabular-nums text-accent">{c.id}</span>
      <Link to={`/quran/surah/${c.id}`} className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold">{c.name_simple}</p>
        <p className="truncate text-[12px] text-muted">{c.translated_name.name} · {t('аятов: {0}', c.verses_count)} · {c.revelation_place === 'makkah' ? t('мекканская') : t('мединская')}</p>
      </Link>
      <span className="quran shrink-0 text-[21px] leading-none text-accent-strong dark:text-gold" lang="ar">{c.name_arabic}</span>
      <Link to={`/quran/page/${c.pages[0]}`} className="btn btn-ghost btn-icon shrink-0 text-muted" aria-label={t('Открыть суру {0} в Мусхафе', c.name_simple)} title={t('Мусхаф')}>
        <BookOpen size={18} />
      </Link>
    </li>
  );
}

function Bookmarks({ pref, setPref, chapters }: { pref: QuranPref; setPref: (p: Partial<QuranPref>) => void; chapters: Chapter[] }) {
  if (!pref.pageMarks.length && !pref.ayahMarks.length) {
    return <p className="card py-8 text-center text-sm text-muted">{t('Закладок пока нет. Добавить закладку можно в Мусхафе (страница) или в режиме перевода (аят).')}</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card">
        <h2 className="h2 mb-2 flex items-center gap-2"><BookMarked size={17} className="text-gold" />{t('Страницы')}</h2>
        <ul className="grid gap-1">
          {pref.pageMarks.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <Link to={`/quran/page/${p}`} className="flex-1 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-soft">{t('Страница {0}', p)} · <span className="text-muted">{chapters.filter((c) => c.pages[0] <= p && c.pages[1] >= p).map((c) => c.name_simple).join(', ')}</span></Link>
              <button className="btn btn-ghost btn-icon !text-danger" onClick={() => setPref({ pageMarks: pref.pageMarks.filter((x) => x !== p) })} aria-label={t('Удалить закладку')}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 className="h2 mb-2 flex items-center gap-2"><BookMarked size={17} className="text-accent" />{t('Аяты')}</h2>
        <ul className="grid gap-1">
          {pref.ayahMarks.map((k) => {
            const [s, a] = k.split(':').map(Number);
            return (
              <li key={k} className="flex items-center gap-2">
                <Link to={`/quran/surah/${s}?a=${a}`} className="flex-1 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-soft">{chapters.find((c) => c.id === s)?.name_simple ?? s} {k}</Link>
                <button className="btn btn-ghost btn-icon !text-danger" onClick={() => setPref({ ayahMarks: pref.ayahMarks.filter((x) => x !== k) })} aria-label={t('Удалить закладку')}><Trash2 size={16} /></button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Загрузка всех 604 страниц мусхафа для чтения без интернета. */
function OfflineCard() {
  const { toast } = useUI();
  const [state, setState] = useState<{ done: number; running: boolean; checked?: number }>({ done: 0, running: false });
  async function check() {
    let n = 0;
    for (let p = 1; p <= PAGES; p += 1) if (await isCached(pageUrl(p))) n++;
    setState((s) => ({ ...s, checked: n }));
  }
  async function run() {
    setState({ done: 0, running: true });
    let done = 0, failed = 0;
    const queue = Array.from({ length: PAGES }, (_, i) => i + 1);
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift() as number;
        try { await getPage(p); } catch { failed++; }
        done++;
        if (done % 6 === 0 || done === PAGES) setState({ done, running: true });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setState({ done: PAGES, running: false, checked: PAGES - failed });
    toast(failed ? t('Сохранено страниц: {0}, не удалось: {1}', PAGES - failed, failed) : t('Мусхаф сохранён для чтения без интернета'), failed ? 'error' : 'ok');
  }
  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2 flex items-center gap-2"><CloudDownload size={18} className="text-accent" />{t('Чтение без интернета')}</h2>
          <p className="text-[13px] text-muted">{t('Открытые страницы сохраняются автоматически. Можно сохранить весь Мусхаф: 604 страницы, несколько мегабайт.')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={check} disabled={state.running}>{t('Проверить')}</button>
          <button className="btn btn-primary btn-sm" onClick={run} disabled={state.running}><CloudDownload size={15} />{t('Сохранить весь Мусхаф')}</button>
        </div>
      </div>
      {state.running && <div className="grid gap-1"><ProgressBar value={state.done / PAGES} label={t('Загрузка страниц')} /><p className="text-[12px] text-muted tabular-nums">{state.done} / {PAGES}</p></div>}
      {!state.running && state.checked !== undefined && <p className="text-[13px]">{t('Сохранено страниц: {0} из {1}', state.checked, PAGES)}</p>}
    </section>
  );
}
