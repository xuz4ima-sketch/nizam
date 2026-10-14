import { Component, Fragment, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataProvider, useData } from './state/data';
import { getLang, loadLang, t } from './i18n';
import type { Lang } from './db/schema';
import { UIProvider } from './components/ui';
import { Layout, MorePage } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Planner } from './pages/Planner';

/** После обновления приложения старая страница может запросить удалённые файлы — перезагружаемся один раз. */
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return lazy(() => load().then((m) => {
    try { sessionStorage.removeItem('nizam-reloaded'); } catch { /* недоступно */ }
    return m;
  }).catch((e) => {
    let reloaded = false;
    try { reloaded = sessionStorage.getItem('nizam-reloaded') === '1'; sessionStorage.setItem('nizam-reloaded', '1'); } catch { /* недоступно */ }
    if (!reloaded) { location.reload(); return new Promise<never>(() => {}); }
    throw e;
  }));
}

const Habits = page(() => import('./pages/Habits'));
const Study = page(() => import('./pages/Study'));
const Goals = page(() => import('./pages/Goals'));
const Focus = page(() => import('./pages/Focus'));
const Recovery = page(() => import('./pages/Recovery'));
const Stats = page(() => import('./pages/Stats'));
const Review = page(() => import('./pages/Review'));
const SettingsPage = page(() => import('./pages/Settings'));
const CalendarPage = page(() => import('./pages/Calendar'));
const HistoryPage = page(() => import('./pages/History'));
const QuranHome = page(() => import('./islam/quran/QuranHome'));
const Mushaf = page(() => import('./islam/quran/Mushaf'));
const SurahStudy = page(() => import('./islam/quran/SurahStudy'));
const HadithHome = page(() => import('./islam/hadith/HadithHome'));
const HadithBook = page(() => import('./islam/hadith/HadithBook'));
const LibraryHome = page(() => import('./islam/library/LibraryHome'));
const TextReader = page(() => import('./islam/library/TextReader'));

/** Скелет загрузки в форме будущего содержимого — без «прыжков» интерфейса. */
function Loading() {
  return (
    <div className="grid gap-4" role="status" aria-live="polite" aria-label={t('Загрузка')}>
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-40 w-full !rounded-[22px]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="skeleton h-64 w-full" />
      <span className="sr-only">{t('Загрузка…')}</span>
    </div>
  );
}

function BootLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
        <p className="text-sm font-semibold text-muted">{t('НИЗАМ загружается…')}</p>
      </div>
    </div>
  );
}

/** Загружает словарь выбранного языка; смена языка перемонтирует интерфейс целиком. */
function I18nGate({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const want = settings.language;
  const [ready, setReady] = useState<Lang | null>(() => (getLang() === want ? want : null));
  useEffect(() => {
    if (ready === want && getLang() === want) return;
    let alive = true;
    loadLang(want).then(() => { if (alive) { setReady(want); document.title = want === 'ar' ? 'نِظَام' : want === 'en' ? 'NIZAM — نِظَام' : 'НИЗАМ — نِظَام'; } }).catch(() => { if (alive) setReady(getLang()); });
    return () => { alive = false; };
  }, [want, ready]);
  if (!ready) return <BootLoading />;
  return <Fragment key={ready}>{children}</Fragment>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-lg px-4">
        <div className="card">
          <h1 className="h1 mb-2">{t('Что-то пошло не так')}</h1>
          <p className="muted mb-3">
            {t('Ваши данные хранятся в браузере и не были удалены. Попробуйте перезагрузить страницу. Если вы открыли приложение в приватном режиме, хранилище может быть недоступно.')}
          </p>
          <pre className="mb-4 overflow-auto rounded-lg bg-soft p-3 text-xs">{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>{t('Перезагрузить')}</button>
        </div>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <UIProvider>
        <DataProvider fallback={<BootLoading />}>
          <I18nGate>
          <HashRouter>
            <Layout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tasks" element={<Planner />} />
                  <Route path="/plan" element={<Navigate to="/tasks" replace />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/habits" element={<Habits />} />
                  <Route path="/study" element={<Study />} />
                  <Route path="/faith" element={<Study faith />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/focus" element={<Focus />} />
                  <Route path="/recovery" element={<Recovery />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/more" element={<MorePage />} />
                  <Route path="/quran" element={<QuranHome />} />
                  <Route path="/quran/page/:page" element={<Mushaf />} />
                  <Route path="/quran/surah/:id" element={<SurahStudy />} />
                  <Route path="/hadith" element={<HadithHome />} />
                  <Route path="/hadith/:coll/:book" element={<HadithBook />} />
                  <Route path="/mutun" element={<LibraryHome mode="mutun" />} />
                  <Route path="/library" element={<LibraryHome mode="books" />} />
                  <Route path="/library/:id" element={<TextReader />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          </HashRouter>
          </I18nGate>
        </DataProvider>
      </UIProvider>
    </ErrorBoundary>
  );
}
