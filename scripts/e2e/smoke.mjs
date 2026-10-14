// Сквозная проверка опубликованного или локального сайта.
//   node scripts/e2e/smoke.mjs <url> [chromium|webkit] [ширина]
// Пример: node scripts/e2e/smoke.mjs https://xuz4ima-sketch.github.io/nizam/ webkit 390
import { chromium, webkit } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , base = 'http://localhost:4173/', engine = 'chromium', width = '390'] = process.argv;
const W = Number(width);

function chromiumPath() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  const exe = dir && join(root, dir, 'chrome-win64', 'chrome.exe');
  return exe && existsSync(exe) ? exe : undefined;
}

const browser = engine === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, locale: 'ru-RU', serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/403|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, info }); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message ?? e).slice(0, 300) }); }
};
const go = async (hash) => { await page.goto(base + '#' + hash, { waitUntil: 'domcontentloaded' }); };
const overflow = () => page.evaluate((w) => {
  for (const el of document.querySelectorAll('#main *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || (r.right <= w + 1 && r.left >= -1)) continue;
    let a = el.parentElement, ok = false;
    while (a && a !== document.body) {
      const ox = getComputedStyle(a).overflowX;
      if (['auto', 'scroll', 'hidden', 'clip'].includes(ox)) { const ar = a.getBoundingClientRect(); if (ar.right <= w + 1 && ar.left >= -1) { ok = true; break; } }
      a = a.parentElement;
    }
    if (!ok) return `${el.tagName}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}]`;
  }
  return null;
}, W);

await step('главная загружается', async () => {
  await go('/');
  await page.waitForSelector('h1', { timeout: 20000 });
  return await page.textContent('h1');
});

await step('быстрое добавление сохраняется после перезагрузки', async () => {
  await go('/tasks');
  await page.waitForSelector('#quick', { timeout: 15000 });
  const title = 'Проверка e2e ' + Date.now().toString(36);
  await page.fill('#quick', `${title} в 21:30 45 мин`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`text=${title}`, { timeout: 15000 });
  return title;
});

await step('арабский интерфейс: справа налево', async () => {
  await go('/');
  await page.waitForSelector('h1');
  await page.click('button[aria-expanded][aria-label^="Язык"] >> visible=true');
  await page.click('button[role="option"][lang="ar"] >> visible=true');
  await page.waitForFunction(() => document.documentElement.dir === 'rtl' && /[؀-ۿ]/.test(document.querySelector('h1')?.textContent ?? ''), null, { timeout: 15000 });
  const h1 = await page.textContent('h1');
  // вернуть русский
  await page.click('button[aria-expanded][aria-label^="اللغة"] >> visible=true');
  await page.click('button[role="option"][lang="ru"] >> visible=true');
  await page.waitForFunction(() => document.documentElement.dir === 'ltr', null, { timeout: 15000 });
  return h1;
});

await step('Мусхаф: страница 1 (аль-Фатиха, 7 аятов)', async () => {
  await go('/quran/page/1');
  await page.waitForFunction(() => document.querySelectorAll('.ayah-end').length >= 7, null, { timeout: 30000 });
  return await page.evaluate(() => document.querySelectorAll('.ayah-end').length);
});

await step('сура 103 с переводом Кулиева', async () => {
  await go('/quran/surah/103');
  await page.waitForSelector('[data-ayah]', { timeout: 30000 });
  const n = await page.evaluate(() => document.querySelectorAll('[data-ayah]').length);
  const tr = await page.evaluate(() => document.querySelector('[data-ayah] p.leading-relaxed')?.textContent ?? '');
  if (n !== 3 || !tr) throw new Error(`аятов ${n}, перевод «${tr}»`);
  return tr.slice(0, 60);
});

await step('хадисы: аль-Бухари, книга 81', async () => {
  await go('/hadith/bukhari/81');
  await page.waitForSelector('text=№ 6412', { timeout: 30000 });
  return 'ok';
});

await step('мутун: Байкуния — 34 бейта в режиме заучивания', async () => {
  await go('/library/bayquni?m=learn');
  await page.waitForSelector('#unit-33', { timeout: 20000 });
  const n = await page.evaluate(() => document.querySelectorAll('[id^="unit-"]').length);
  if (n !== 34) throw new Error('строк ' + n);
  return n;
});

{
  for (const p of ['/', '/tasks', '/calendar', '/stats', '/quran', '/hadith', '/mutun', '/settings']) {
    await step(`без переполнения ${W}px: ${p}`, async () => {
      await go(p);
      await page.waitForTimeout(1500);
      const bad = await overflow();
      if (bad) throw new Error(bad);
      return 'ok';
    });
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name} (${r.ms} мс)${r.ok ? (r.info ? ' — ' + r.info : '') : ' — ' + r.error}`);
console.log(errors.length ? `\nОшибки страницы (${errors.length}):\n` + [...new Set(errors)].slice(0, 10).join('\n') : '\nОшибок в консоли нет');
process.exit(failed.length || errors.length ? 1 : 0);
