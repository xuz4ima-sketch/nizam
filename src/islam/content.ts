// Загрузка внешнего контента (Коран, тафсир, хадисы) с кэшированием в Cache Storage:
// однажды открытое доступно без интернета. Тексты не изменяются — только отображаются.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { t } from '../i18n';

const CACHE = 'nizam-content-v1';
const memory = new Map<string, Promise<unknown>>();

async function fromCache(url: string): Promise<Response | undefined> {
  try { return await (await caches.open(CACHE)).match(url); } catch { return undefined; }
}

/** JSON с кэшем: сначала Cache Storage, затем сеть (с повтором). Ошибки — понятным текстом. */
export function cachedJSON<T>(url: string): Promise<T> {
  const hit = memory.get(url);
  if (hit) return hit as Promise<T>;
  const p = (async () => {
    const c = await fromCache(url);
    if (c) return (await c.json()) as T;
    let lastErr: unknown;
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(url);
        if (r.status >= 400 && r.status < 500) throw Object.assign(new Error(`HTTP ${r.status}`), { fatal: true });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        try { await (await caches.open(CACHE)).put(url, r.clone()); } catch { /* кэш недоступен — работаем без него */ }
        return (await r.json()) as T;
      } catch (e) {
        lastErr = e;
        if ((e as { fatal?: boolean }).fatal) break; // 4xx: повтор бесполезен
        await new Promise((res) => setTimeout(res, 600 * (a + 1)));
      }
    }
    throw new Error(navigator.onLine === false
      ? t('Нет подключения к интернету. Этот раздел ещё не сохранён для чтения офлайн.')
      : t('Не удалось загрузить данные: {0}', String((lastErr as Error)?.message ?? lastErr)));
  })();
  memory.set(url, p);
  p.catch(() => memory.delete(url));
  return p;
}

/** Первый успешно загруженный адрес из списка зеркал. */
export async function cachedFirst<T>(urls: string[]): Promise<T> {
  let err: unknown;
  for (const u of urls) {
    try { return await cachedJSON<T>(u); } catch (e) { err = e; }
  }
  throw err;
}

export async function isCached(url: string) { return !!(await fromCache(url)); }

export interface Loadable<T> { data?: T; error?: string; loading: boolean; reload: () => void }

/** Хук загрузки: null-ключ — ничего не загружать. */
export function useLoad<T>(key: string | null, load: () => Promise<T>): Loadable<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: string }>({ key: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState((s) => (s.key === key && s.data ? s : { key }));
    load().then((data) => { if (alive) setState({ key, data }); })
      .catch((e: unknown) => { if (alive) setState({ key, error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = state.key === key;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : undefined, loading: !!key && (!fresh || (!state.data && !state.error)), reload: () => setNonce((n) => n + 1) };
}

/* ---------- Настройки чтения (таблица prefs) ---------- */

export function usePref<T extends object>(id: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const row = useLiveQuery(() => db.prefs.get(id), [id]);
  const value = { ...defaults, ...((row?.value as Partial<T>) ?? {}) };
  const set = (patch: Partial<T>) => {
    db.transaction('rw', db.prefs, async () => {
      const cur = await db.prefs.get(id);
      await db.prefs.put({ id, value: { ...defaults, ...((cur?.value as object) ?? {}), ...patch }, updatedAt: Date.now() });
    }).catch(() => { /* хранилище недоступно — настройка не сохранится, интерфейс продолжит работать */ });
  };
  return [value, set];
}

/** Безопасный HTML для тафсира: только разметка текста, без атрибутов, ссылок и скриптов. */
export function sanitizeHTML(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const ALLOW = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'SPAN', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV']);
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      if (c.tagName === 'SUP' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') { c.remove(); continue; }
      walk(c);
      if (!ALLOW.has(c.tagName)) { c.replaceWith(...c.childNodes); continue; }
      const arabic = c.classList.contains('arabic') || /[؀-ۿ]/.test(c.textContent ?? '') && c.tagName === 'SPAN';
      for (const a of [...c.attributes]) c.removeAttribute(a.name);
      if (arabic) { c.setAttribute('class', 'q-quote'); c.setAttribute('lang', 'ar'); }
    }
  };
  const root = doc.body.firstElementChild as Element;
  walk(root);
  return root.innerHTML;
}

/** Арабско-индийские цифры для номеров аятов. */
export const arabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
