import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { DataProvider } from './state/data';
import { UIProvider } from './components/ui';
import { Layout } from './components/Layout';
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

function Loading() {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-muted" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        Загрузка…
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-lg px-4">
        <div className="card">
          <h1 className="h1 mb-2">Что-то пошло не так</h1>
          <p className="muted mb-3">
            Ваши данные хранятся в браузере и не были удалены. Попробуйте перезагрузить страницу.
            Если вы открыли приложение в приватном режиме, хранилище может быть недоступно.
          </p>
          <pre className="mb-4 overflow-auto rounded-lg bg-soft p-3 text-xs">{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>Перезагрузить</button>
        </div>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <UIProvider>
        <DataProvider fallback={<Loading />}>
          <HashRouter>
            <Layout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/plan" element={<Planner />} />
                  <Route path="/habits" element={<Habits />} />
                  <Route path="/study" element={<Study />} />
                  <Route path="/faith" element={<Study faith />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/focus" element={<Focus />} />
                  <Route path="/recovery" element={<Recovery />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Dashboard />} />
                </Routes>
              </Suspense>
            </Layout>
          </HashRouter>
        </DataProvider>
      </UIProvider>
    </ErrorBoundary>
  );
}
