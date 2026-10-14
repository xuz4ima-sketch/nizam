import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Feather, GraduationCap } from 'lucide-react';
import { PageHeader, ProgressBar } from '../../components/ui';
import { db } from '../../db/db';
import { getLang, t } from '../../i18n';
import { SourceNote } from '../ui';
import { CATEGORIES, EN_TITLES, MUTUN_IDS, RU_TITLES, TEXTS, unitCount, type TextMeta } from './texts';

export default function LibraryHome({ mode }: { mode: 'mutun' | 'books' }) {
  const lang = getLang();
  const memo = useLiveQuery(() => db.memo.toArray(), []);
  const learned = new Map<string, number>();
  for (const m of memo ?? []) if (m.status === 'memorized') learned.set(m.textId, (learned.get(m.textId) ?? 0) + 1);
  const list = mode === 'mutun' ? MUTUN_IDS.map((id) => TEXTS.find((x) => x.id === id)).filter(Boolean) as TextMeta[] : TEXTS;
  const cats = Object.keys(CATEGORIES).filter((c) => list.some((x) => x.category === c));

  return (
    <div className="fade-in grid gap-6">
      <PageHeader
        title={mode === 'mutun' ? t('Мутуны талиб аль-ильм') : t('Исламские книги')}
        subtitle={mode === 'mutun'
          ? t('Классические тексты для заучивания: чтение, скрытие строк, повторы, отметка выученного и озвучка.')
          : t('Классические тексты на арабском в удобном для чтения формате: оглавление, размер шрифта, закладка места.')} />
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="eyebrow mb-2">{lang === 'ar' ? CATEGORIES[cat].ar : lang === 'en' ? CATEGORIES[cat].en : CATEGORIES[cat].ru}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.filter((x) => x.category === cat).map((x) => {
              const total = unitCount(x);
              const done = learned.get(x.id) ?? 0;
              return (
                <li key={x.id}>
                  <Link to={`/library/${x.id}${mode === 'mutun' ? '?m=learn' : ''}`} className="card group flex h-full flex-col gap-3 transition-colors hover:border-accent/40">
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{x.kind === 'poem' ? <Feather size={20} /> : <BookOpen size={20} />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="matn text-[20px] leading-snug text-accent-strong dark:text-fg" lang="ar" dir="rtl">{x.title}</p>
                        <p className="text-[12.5px] text-muted">{lang === 'ru' ? RU_TITLES[x.id] : lang === 'en' ? EN_TITLES[x.id] : ''}{lang !== 'ar' && ' · '}<span lang="ar">{x.author}</span></p>
                      </div>
                    </div>
                    <p className="text-[12px] text-muted">{x.kind === 'poem' ? t('Стихотворный текст: {0} бейтов', x.abyat) : t('Проза: {0} абзацев, разделов: {1}', x.paragraphs, x.sections)}</p>
                    {mode === 'mutun' && (
                      <div className="mt-auto grid gap-1">
                        <ProgressBar value={total ? done / total : 0} size="sm" tone="gold" label={t('Выучено')} />
                        <p className="flex items-center gap-1 text-[12px] font-semibold text-muted"><GraduationCap size={13} />{t('Выучено {0} из {1}', done, total)}</p>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <SourceNote>{t('Тексты: арабская Викитека (ar.wikisource.org), лицензия CC BY-SA 4.0; для каждого текста в читалке указана ссылка на версию источника. Перевод на русский не приводится — переводы этих трудов защищены авторским правом.')}</SourceNote>
    </div>
  );
}
