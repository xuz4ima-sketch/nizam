import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Copy, Search } from 'lucide-react';
import { PageHeader, Tabs, useUI } from '../../components/ui';
import { getLang, t } from '../../i18n';
import { usePref } from '../content';
import { FontStepper, SourceNote } from '../ui';
import timeData from '../../data/hadith-time.json';
import { COLLECTIONS, type CollectionKey } from './books';
import { HADITH_PREF, type HadithPref } from './prefs';

interface TimeHadith {
  id: string; collection: string; number: number; canonical: string; theme: string;
  grades: { name: string; grade: string }[]; ar: string; ru: string | null; en: string | null;
}

const THEMES: Record<string, string> = {
  time: 'Время — милость, которую многие теряют',
  account: 'О жизни спросят',
  benefit: 'Занимайся полезным',
  hasten: 'Спеши с благими делами',
  hope: 'Срок и долгие надежды',
  order: 'Постоянство и умеренность',
  gratitude: 'Благодарность за день',
};
const COLL_NAMES: Record<string, string> = { bukhari: 'аль-Бухари', muslim: 'Муслим', tirmidhi: 'ат-Тирмизи' };

export default function HadithHome() {
  const [tab, setTab] = useState<'time' | CollectionKey>('time');
  return (
    <div className="fade-in grid gap-5">
      <PageHeader title={t('Хадисы')} subtitle={t('Хадисы о ценности времени и порядке жизни, а также «Сахих» аль-Бухари и Муслима по книгам.')} />
      <Tabs label={t('Разделы хадисов')} value={tab} onChange={setTab}
        items={[['time', t('Время и порядок жизни')], ['bukhari', t('Сахих аль-Бухари')], ['muslim', t('Сахих Муслим')]]} />
      {tab === 'time' ? <TimeCollection /> : <BookList coll={tab} />}
      <SourceNote>
        {t('Тексты хадисов, номера и оценки — из открытого набора fawazahmed0/hadith-api (арабский оригинал, русский и английский переводы). Номера Муслима даны по нумерации Абд аль-Баки. Если русского перевода хадиса в источнике нет, показан английский.')}
      </SourceNote>
    </div>
  );
}

function TimeCollection() {
  const lang = getLang();
  const { toast } = useUI();
  const [pref, setPref] = usePref<HadithPref>('hadith', HADITH_PREF);
  const items = (timeData as { items: TimeHadith[] }).items;
  return (
    <div className="grid gap-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <FontStepper label={t('Арабский текст')} value={pref.arFont} min={16} max={44} onChange={(v) => setPref({ arFont: v })} />
        {lang !== 'ar' && <FontStepper label={t('Перевод')} value={pref.trFont} min={12} max={32} onChange={(v) => setPref({ trFont: v })} />}
      </div>
      <ol className="grid gap-4">
        {items.map((h) => {
          const tr = lang === 'ru' ? (h.ru ?? h.en) : lang === 'en' ? h.en : null;
          const trIsEn = lang === 'ru' && !h.ru;
          const source = `${t(COLL_NAMES[h.collection] ?? h.collection)}, № ${h.canonical}`;
          return (
            <li key={h.id} className="card grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip !bg-gold-soft !text-[#86672f] dark:!text-gold">{t(THEMES[h.theme] ?? h.theme)}</span>
                <span className="text-[12px] font-semibold text-muted">{source}</span>
                {h.grades.length > 0 && (
                  <span className="text-[12px] text-muted">· {h.grades.filter((g) => /albani|shakir/i.test(g.name)).map((g) => `${g.name}: ${g.grade}`).join('; ')}</span>
                )}
                <span className="flex-1" />
                <button className="btn btn-ghost btn-icon !min-h-8 !min-w-8 text-muted" aria-label={t('Копировать хадис')}
                  onClick={() => navigator.clipboard?.writeText(`${h.ar}\n\n${tr ?? ''}\n(${source})`).then(() => toast(t('Скопировано')), () => toast(t('Не удалось скопировать'), 'error'))}>
                  <Copy size={15} />
                </button>
              </div>
              <p className="matn text-right text-accent-strong dark:text-fg" style={{ fontSize: pref.arFont }} lang="ar" dir="rtl">{h.ar}</p>
              {tr && (
                <div>
                  {trIsEn && <p className="mb-1 text-[11.5px] font-semibold text-muted">{t('Русского перевода в источнике нет — английский перевод:')}</p>}
                  <p className="whitespace-pre-line leading-relaxed text-fg/90" style={{ fontSize: pref.trFont }} lang={trIsEn ? 'en' : undefined}>{tr}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BookList({ coll }: { coll: CollectionKey }) {
  const lang = getLang();
  const [q, setQ] = useState('');
  const c = COLLECTIONS[coll];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return c.books.filter((b) => !s || String(b.n) === s || b.ru.toLowerCase().includes(s) || b.en.toLowerCase().includes(s) || b.ar.includes(q.trim()));
  }, [c, q]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="quran text-[24px] text-accent-strong dark:text-gold" lang="ar">{c.ar}</p>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">{t('Поиск книги')}</span>
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Название или номер книги')} />
        </label>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((b) => (
          <li key={b.n}>
            <Link to={`/hadith/${coll}/${b.n}`} className="card-flat flex items-center gap-3 p-3 transition-colors hover:border-accent/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-[13px] font-extrabold tabular-nums text-accent">{b.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{lang === 'ar' ? `كتاب ${b.ar}` : lang === 'en' ? b.en : b.ru}</span>
                <span className="block truncate text-[12px] text-muted">
                  {lang !== 'ar' && <span className="arabic" lang="ar">كتاب {b.ar} · </span>}{t('хадисы {0}–{1}', b.from, b.to)}
                </span>
              </span>
              <ChevronLeft size={18} className="shrink-0 text-muted ltr:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
