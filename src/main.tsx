import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lib/install'; // перехват beforeinstallprompt как можно раньше
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';

// Обновление приложения: новый service worker активируется сразу, страница перезагружается сама,
// чтобы пользователь не остался на старой версии. Проверка обновлений — раз в час, пока вкладка открыта.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
