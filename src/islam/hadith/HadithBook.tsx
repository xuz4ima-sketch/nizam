import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Copy, Search, Settings2 } from 'lucide-react';
import { useUI } from '../../components/ui';
import { getLang, t } from '../../i18n';
import { useLoad, usePref } from '../content';
import { ErrorBlock, FontStepper, LoadingBlock, SourceNote, Toggle } from '../ui';
import { canonicalNumber, getSection, type HadithRow } from './api';
import { COLLECTIONS, type CollectionKey } from './books';
import { HADITH_PREF, type HadithPref } from './prefs';

const PAGE = 25;

export default function HadithBook() {
  const params = useParams();
  const coll = (params.coll === 'muslim' ? 'muslim' : 'bukhari') as CollectionKey;
  const c = COLLECTIONS[coll];
  const bookN = Number(params.book) || (coll === 'muslim' ? 0 : 1);
  const book = c.books.find((b) => b.n === bookN) ?? c.books[0];
  const lang = getLang();
  const nav = useNavigate();
  const { toast } = useUI();
  const [pref, setPref] = usePref<HadithPref>('hadith', HADITH_PREF);
  const [panel, setPanel] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const ar = useLoad(`h:${coll}:${book.n}:ara`, () => getSection(coll, book.n, 'ara'));
  const trEd = lang === 'ru' ? 'rus' : lang === 'en' ? 'eng' : null;
  const tr = useLoad(trEd ? `h:${coll}:${book.n}:${trEd}` : null, () => getSection(coll, book.n, trEd as 'rus' | 'eng'));
  // Для русского языка — английский перевод как запасной, если русского перевода хадиса нет.
  const en = useLoad(lang === 'ru' ? `h:${coll}:${book.n}:eng` : null, () => getSection(coll, book.n, 'eng'));

  useEffect(() => { setLimit(PAGE); window.scrollTo({ top: 0 }); setPref({ last: { ...pref.last, [coll]: book.n } }); }, [coll, book.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const trMap = new Map((tr.data ?? []).map((h) => [h.hadithnumber, h.text]));
    const enMap = new Map((en.data ?? []).map((h) => [h.hadithnumber, h.text]));
    return (ar.data ?? []).filter((h) => h.text.trim()).map((h) => {
      const own = trMap.get(h.hadithnumber)?.trim();
      const fallback = lang === 'ru' && !own ? enMap.get(h.hadithnumber)?.trim() : undefined;
      return { h, tr: own || fallback || '', trIsEn: !own && !!fallback };
    });
  }, [ar.data, tr.data, en.data, lang]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    const strip = (x: string) => x.replace(/[ً-ْٰـ]/g, '');
    return rows.filter((r) => canonicalNumber(r.h) === s || String(r.h.hadithnumber) === s || r.tr.toLowerCase().includes(s) || strip(r.h.text).includes(strip(q.trim())));
  }, [rows, q]);

  const idx = c.books.findIndex((b) => b.n === book.n);
  const prev = c.books[idx - 1], next = c.books[idx + 1];
  const title = lang === 'ar' ? `كتاب ${book.ar}` : lang === 'en' ? book.en : book.ru;
  const collName = lang === 'ar' ? c.ar : lang === 'en' ? c.en : c.ru;

  return (
    <div className="fade-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Link to="/hadith" className="btn btn-ghost btn-icon" aria-label={t('К списку книг')}><ChevronRight size={20} className="ltr:rotate-180" /></Link>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-muted">{collName} · {t('Книга {0}', book.n)}</p>
            <h1 className="h1">{title}</h1>
            {lang !== 'ar' && <p className="arabic text-[18px] text-accent" lang="ar" dir="rtl">كتاب {book.ar}</p>}
          </div>
        </div>
        <button className="btn btn-outline btn-icon" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={t('Настройки чтения')}><Settings2 size={18} /></button>
      </div>

      {panel && (
        <section className="card fade-in mb-4 grid gap-3 md:grid-cols-2">
          <FontStepper label={t('Арабский текст')} value={pref.arFont} min={16} max={44} onChange={(v) => setPref({ arFont: v })} />
          {trEd && <FontStepper label={t('Перевод')} value={pref.trFont} min={12} max={32} onChange={(v) => setPref({ trFont: v })} />}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Toggle on={pref.showArabic} onChange={(v) => setPref({ showArabic: v })}>{t('Арабский текст')}</Toggle>
            {trEd && <Toggle on={pref.showTranslation} onChange={(v) => setPref({ showTranslation: v })}>{t('Перевод')}</Toggle>}
          </div>
        </section>
      )}

      <label className="relative mb-4 block">
        <span className="sr-only">{t('Поиск в книге')}</span>
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input ps-9" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t('Поиск по номеру или словам в этой книге')} />
      </label>

      {ar.error && <ErrorBlock error={ar.error} onRetry={ar.reload} />}
      {ar.loading && <LoadingBlock />}
      {ar.data && (
        <>
          <p className="mb-3 text-[12.5px] text-muted">{q ? t('Найдено: {0}', filtered.length) : t('Хадисов в книге: {0}', rows.length)}</p>
          <ol className="grid gap-3">
            {filtered.slice(0, limit).map(({ h, tr: text, trIsEn }) => (
              <HadithCard key={h.hadithnumber} h={h} text={text} trIsEn={trIsEn} coll={coll} collName={collName} pref={pref} setPref={setPref}
                onCopy={(s) => navigator.clipboard?.writeText(s).then(() => toast(t('Скопировано')), () => toast(t('Не удалось скопировать'), 'error'))} />
            ))}
          </ol>
          {filtered.length > limit && (
            <button className="btn btn-outline mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>{t('Показать ещё ({0})', filtered.length - limit)}</button>
          )}
          <nav className="mt-6 flex justify-between gap-2" aria-label={t('Соседние книги')}>
            <button className="btn btn-outline" disabled={!prev} onClick={() => prev && nav(`/hadith/${coll}/${prev.n}`)}><ChevronRight size={17} className="ltr:rotate-180" />{t('Предыдущая книга')}</button>
            <button className="btn btn-outline" disabled={!next} onClick={() => next && nav(`/hadith/${coll}/${next.n}`)}>{t('Следующая книга')}<ChevronLeft size={17} className="ltr:rotate-180" /></button>
          </nav>
        </>
      )}
      <SourceNote>{t('Источник: fawazahmed0/hadith-api. Арабский текст с иснадом; переводы — как в источнике.')}</SourceNote>
    </div>
  );
}

function HadithCard({ h, text, trIsEn, coll, collName, pref, setPref, onCopy }: {
  h: HadithRow; text: string; trIsEn: boolean; coll: CollectionKey; collName: string; pref: HadithPref; setPref: (p: Partial<HadithPref>) => void; onCopy: (s: string) => void;
}) {
  const key = `${coll}:${h.hadithnumber}`;
  const marked = pref.marks.includes(key);
  const num = canonicalNumber(h);
  const showAr = pref.showArabic || !text;
  return (
    <li className="card grid gap-3 !p-4 sm:!p-5">
      <div className="flex items-center gap-1">
        <span className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-extrabold tabular-nums text-accent">№ {num}</span>
        {coll === 'muslim' && String(h.arabicnumber ?? '').includes('.') && <span className="text-[11px] text-muted">{t('вариант {0}', Number(String(h.arabicnumber).split('.')[1]))}</span>}
        <span className="flex-1" />
        <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8 text-muted" aria-label={t('Копировать хадис')} onClick={() => onCopy(`${h.text}\n\n${text}\n(${collName}, № ${num})`)}><Copy size={15} /></button>
        <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8" aria-pressed={marked} aria-label={marked ? t('Убрать закладку') : t('Добавить закладку')}
          onClick={() => setPref({ marks: marked ? pref.marks.filter((k) => k !== key) : [key, ...pref.marks].slice(0, 200) })}>
          {marked ? <BookmarkCheck size={16} className="text-gold" /> : <Bookmark size={16} className="text-muted" />}
        </button>
      </div>
      {showAr && <p className="matn text-right" style={{ fontSize: pref.arFont }} lang="ar" dir="rtl">{h.text}</p>}
      {pref.showTranslation && text && (
        <div>
          {trIsEn && <p className="mb-1 text-[11.5px] font-semibold text-muted">{t('Русского перевода в источнике нет — английский перевод:')}</p>}
          <p className="whitespace-pre-line leading-relaxed text-fg/90" style={{ fontSize: pref.trFont }} lang={trIsEn ? 'en' : undefined}>{text}</p>
        </div>
      )}
    </li>
  );
}
