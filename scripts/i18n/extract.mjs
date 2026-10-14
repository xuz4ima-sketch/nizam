// Извлекает ключи перевода (русские строки интерфейса) и проверяет словари.
//   node scripts/i18n/extract.mjs            — список ключей без перевода (en/ar)
//   node scripts/i18n/extract.mjs --write F  — записать все ключи в JSON-массив F
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

const CYR = /[А-Яа-яЁё]/;
// Файлы, где русские строки — данные или явные русские подписи, а не ключи перевода.
const SKIP = ['src/islam/library/texts.ts', 'src/islam/hadith/books.ts', 'src/lib/quickadd.ts', 'src/i18n/'];

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f).split('\\').join('/');
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(p) && !SKIP.some((s) => p.startsWith(s))) files.push(p);
  }
})('src');

const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'StringLiteral' && CYR.test(n.value)) keys.add(n.value);
    if (n.type === 'TemplateLiteral' && n.quasis.some((q) => CYR.test(q.value.cooked))) {
      // шаблоны в коде остались только внутри данных/комментариев — пропускаем, но сообщаем
      console.error(`шаблон с кириллицей: ${f}:${n.loc.start.line}`);
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'extra'].includes(k) || k.endsWith('Comments')) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast.program);
}

const list = [...keys].sort((a, b) => a.localeCompare(b, 'ru'));
const i = process.argv.indexOf('--write');
if (i > 0) { writeFileSync(process.argv[i + 1], JSON.stringify(list, null, 1)); console.log('ключей:', list.length); }
else {
  for (const lang of ['en', 'ar']) {
    const dict = JSON.parse(readFileSync(`src/i18n/${lang}.json`, 'utf8'));
    const miss = list.filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !keys.has(k));
    console.log(`${lang}: ключей ${list.length}, нет перевода ${miss.length}, лишних ${extra.length}`);
    for (const m of miss.slice(0, 15)) console.log('  -', m);
  }
}
