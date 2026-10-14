// Установка PWA: браузер присылает событие beforeinstallprompt (Chrome, Edge, Android).
// В Safari/iOS установка выполняется вручную: «Поделиться» → «На экран „Домой“».
import { useSyncExternalStore } from 'react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export function useInstallPrompt() {
  const available = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => !!deferred, () => false);
  async function install() {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === 'accepted';
  }
  return { available, install };
}
