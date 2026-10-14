// Кодмод: оборачивает русские строки интерфейса в t() (src/i18n).
//   node scripts/i18n/wrap.mjs <файл.tsx> [...]
// Строки на уровне модуля не трогаются (выводятся списком) — их нужно переводить в месте показа.
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, posix } from 'node:path';
import { parse } from '@babel/parser';

const CYR = /[А-Яа-яЁё]/;
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);

function processFile(file) {
  const src = readFileSync(file, 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const edits = []; // {start, end, text}
  const moduleLevel = [];

  const quote = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

  function visit(node, parent, key, stack) {
    if (!node || typeof node.type !== 'string') return;
    const inFn = stack.some((n) => FN.has(n.type));

    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['t', 'T', 'tr'].includes(node.callee.name)) {
      // Первый аргумент — ключ перевода; в подстановках тоже может быть русский текст.
      node.arguments.slice(1).forEach((arg, i) => visit(arg, node, 'arguments', [...stack, node]));
      return;
    }
    if (node.type === 'ImportDeclaration' || node.type === 'TSTypeAnnotation' || node.type === 'TSLiteralType' || node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') return;

    if (node.type === 'JSXText' && CYR.test(node.value)) {
      const raw = node.value;
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      const text = raw.trim().replace(/\s+/g, ' ');
      const keepLead = lead && !lead.includes('\n') ? ' ' : '';
      const keepTrail = trail && !trail.includes('\n') ? ' ' : '';
      edits.push({ start: node.start, end: node.end, text: `${keepLead ? "{' '}" : ''}{T(${quote(text)})}${keepTrail ? "{' '}" : ''}` });
      return;
    }

    if (node.type === 'StringLiteral' && CYR.test(node.value)) {
      const isKey = parent && (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && key === 'key';
      const isEnumOrType = parent && (parent.type === 'TSEnumMember');
      if (isKey || isEnumOrType) return;
      if (!inFn) { moduleLevel.push(`${file}:${node.loc.start.line}: ${node.value}`); return; }
      if (parent && parent.type === 'JSXAttribute') edits.push({ start: node.start, end: node.end, text: `{T(${quote(node.value)})}` });
      else edits.push({ start: node.start, end: node.end, text: `T(${quote(node.value)})` });
      return;
    }

    if (node.type === 'TemplateLiteral' && node.quasis.some((q) => CYR.test(q.value.cooked ?? q.value.raw))) {
      if (parent && parent.type === 'TaggedTemplateExpression') return;
      if (!inFn) { moduleLevel.push(`${file}:${node.loc.start.line}: \`${node.quasis.map((q) => q.value.cooked).join('{}')}\``); return; }
      let s = '';
      node.quasis.forEach((q, i) => { s += q.value.cooked; if (i < node.expressions.length) s += `{${i}}`; });
      const args = node.expressions.map((e) => src.slice(e.start, e.end));
      edits.push({ start: node.start, end: node.end, text: `T(${quote(s)}${args.length ? ', ' + args.join(', ') : ''})` });
      return;
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node, k, [...stack, node]));
      else if (v && typeof v.type === 'string') visit(v, node, k, [...stack, node]);
    }
  }
  visit(ast.program, null, null, []);

  if (!edits.length) return { file, changed: 0, moduleLevel };
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  const hasT = /\bt as T\b/.test(out);
  if (!hasT) {
    let rel = relative(dirname(file), 'src/i18n').split('\\').join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    const imports = [...out.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm)];
    const last = imports.at(-1);
    // Псевдоним T: в коде много локальных переменных с именем t (задачи, таблицы, метки времени).
    const line = `import { t as T } from '${posix.normalize(rel)}';\n`;
    if (last) { const pos = last.index + last[0].length + 1; out = out.slice(0, pos) + line + out.slice(pos); }
    else out = line + out;
  }
  writeFileSync(file, out);
  return { file, changed: edits.length, moduleLevel };
}

const results = process.argv.slice(2).map(processFile);
for (const r of results) console.log(`${r.changed}\t${r.file}`);
const ml = results.flatMap((r) => r.moduleLevel);
if (ml.length) { console.log('\n# Строки уровня модуля (перевести вручную в месте показа):'); for (const m of ml) console.log(m); }
