"""Сборка текстов мутунов из арабской Викитеки (ar.wikisource.org, CC BY-SA 4.0).

Шаг 1 (сеть):   python scripts/texts/build_texts.py fetch <кэш-папка>
Шаг 2 (разбор): python scripts/texts/build_texts.py build <кэш-папка> src/data/texts

Тексты не набираются вручную: берётся отрисованный HTML страницы (с раскрытыми шаблонами),
из него извлекаются заголовки, абзацы и бейты (садр/аджз). Номер ревизии сохраняется в источнике.
Требуется beautifulsoup4.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

UA = {'User-Agent': 'nizam-app/2.0 (educational; https://github.com/xuz4ima-sketch/nizam)'}

# id: (страница Викитеки, название, автор, раздел, тип)
TEXTS = {
    'usul3':     ('الأصول الثلاثة', 'الأصول الثلاثة', 'محمد بن عبد الوهاب', 'aqida', 'prose'),
    'qawaid4':   ('القواعد الأربع', 'القواعد الأربع', 'محمد بن عبد الوهاب', 'aqida', 'prose'),
    'nawaqid':   ('نواقض الإسلام', 'نواقض الإسلام', 'محمد بن عبد الوهاب', 'aqida', 'prose'),
    'kashf':     ('كشف الشبهات', 'كشف الشبهات', 'محمد بن عبد الوهاب', 'aqida', 'prose'),
    'wasitiya':  ('العقيدة الواسطية', 'العقيدة الواسطية', 'ابن تيمية', 'aqida', 'prose'),
    'tahawiya':  ('متن العقيدة الطحاوية', 'العقيدة الطحاوية', 'أبو جعفر الطحاوي', 'aqida', 'prose'),
    'lumah':     ('لمعة الاعتقاد الهادي إلى سبيل الرشاد', 'لمعة الاعتقاد', 'ابن قدامة المقدسي', 'aqida', 'prose'),
    'nawawi40':  ('الأربعون النووية', 'الأربعون النووية', 'يحيى بن شرف النووي', 'hadith', 'prose'),
    'bayquni':   ('منظومة البيقوني', 'المنظومة البيقونية', 'عمر بن محمد البيقوني', 'hadith', 'poem'),
    # 'nukhba' исключена: в источнике повреждено начало текста (дублирование фразы) — не подходит для заучивания.
    'ajurrumiya': ('الآجرومية في قواعد علم العربية', 'المقدمة الآجرومية', 'ابن آجروم', 'arabic', 'prose'),
    'tuhfa':     ('تحفة الأطفال', 'تحفة الأطفال والغلمان', 'سليمان الجمزوري', 'tajwid', 'poem'),
    'jazariya':  ('الجزرية', 'المقدمة الجزرية', 'ابن الجزري', 'tajwid', 'poem'),
}

def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    for key, (page, *_rest) in TEXTS.items():
        q = urllib.parse.urlencode({'action': 'parse', 'page': page, 'prop': 'text|revid', 'format': 'json', 'formatversion': 2, 'redirects': 1})
        for attempt in range(4):
            try:
                d = json.load(urllib.request.urlopen(urllib.request.Request('https://ar.wikisource.org/w/api.php?' + q, headers=UA), timeout=60))
                json.dump({'html': d['parse']['text'], 'revid': d['parse']['revid'], 'title': d['parse']['title']},
                          open(os.path.join(cache, key + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
                print(key, 'ok'); break
            except Exception as e:  # noqa: BLE001
                print(key, 'retry', e); time.sleep(20)
        time.sleep(6)

TATWEEL = re.compile('ـ')
SPACES = re.compile(r'[\s ​‏‎]+')

def clean(t):
    t = TATWEEL.sub('', t)
    t = SPACES.sub(' ', t).strip()
    t = re.sub(r'\s+([،.:؛؟!»)\]}])', r'\1', t)
    t = re.sub(r'([«(\[{])\s+', r'\1', t)
    return t

def build(cache, outdir):
    from bs4 import BeautifulSoup
    os.makedirs(outdir, exist_ok=True)
    index = []
    for key, (page, title, author, cat, kind) in TEXTS.items():
        raw = json.load(open(os.path.join(cache, key + '.json'), encoding='utf-8'))
        soup = BeautifulSoup(raw['html'], 'html.parser')
        root = soup.select_one('.mw-parser-output')
        for sel in ['style', 'link', 'script', '.ws-noexport', '.noprint', '.wst-header', '.mw-editsection', 'sup.reference',
                    'ol.references', '.reflist', '.toc', '#toc', '.mw-references-wrap', '.notheme', '.skin-invert', 'img']:
            for x in root.select(sel): x.decompose()

        sections = [{'title': '', 'items': []}]
        skip_sub = False  # пропуск неподписанного шарха (подразделы h4 в «Сорока хадисах»)

        def add(item):
            if not skip_sub: sections[-1]['items'].append(item)

        def heading(text, level):
            nonlocal skip_sub
            text = clean(text).strip('﴿﴾ ')
            if not text: return
            if key == 'nawawi40' and level >= 4:
                skip_sub = True; return
            skip_sub = False
            if sections[-1]['items'] or sections[-1]['title']:
                sections.append({'title': text, 'items': []})
            else:
                sections[-1]['title'] = text

        def visit(el):
            for c in el.children:
                name = getattr(c, 'name', None)
                if name is None: continue
                cls = c.get('class', [])
                if name in ('h1', 'h2', 'h3', 'h4', 'h5'):
                    heading(c.get_text(' '), int(name[1])); continue
                if 'mw-heading' in cls:
                    h = c.find(re.compile('^h[1-6]$'))
                    if h: heading(h.get_text(' '), int(h.name[1]))
                    continue
                if 'abyat-wrapper' in cls:
                    parts = c.select('.abyat-sdr, .abyat-ajz')
                    cur = None
                    for p in parts:
                        txt = clean(p.get_text(' '))
                        if 'abyat-sdr' in p.get('class', []):
                            cur = {'t': 'b', 's': txt, 'a': ''}
                            add(cur)
                        elif cur is not None:
                            cur['a'] = txt; cur = None
                        else:
                            add({'t': 'b', 's': '', 'a': txt})
                    continue
                if name == 'table':
                    rows = c.find_all('tr')
                    poemish = sum(1 for r in rows if len(r.find_all('td', recursive=False)) >= 2)
                    if kind == 'poem' and poemish:
                        for r in rows:
                            tds = [clean(td.get_text(' ')) for td in r.find_all('td', recursive=False)]
                            tds = [t for t in tds if t]
                            if not tds: continue
                            if len(tds) == 1:
                                heading(tds[0], 3)
                            else:
                                if re.fullmatch(r'\(?[\d٠-٩]+\)?', tds[0]): tds = tds[1:]
                                if len(tds) >= 2: add({'t': 'b', 's': tds[0], 'a': tds[1]})
                                elif tds: add({'t': 'p', 'text': tds[0]})
                    else:
                        visit(c)
                    continue
                if name in ('p', 'li', 'dd'):
                    txt = clean(c.get_text(' '))
                    if txt and txt not in ('*',): add({'t': 'p', 'text': txt})
                    continue
                if name in ('div', 'section', 'center', 'blockquote', 'tbody', 'tr', 'td', 'ul', 'ol', 'dl', 'span', 'font'):
                    # div с «голым» текстом без вложенных блоков — тоже абзац
                    if name in ('div', 'center', 'blockquote') and not c.find(['p', 'div', 'table', 'h2', 'h3', 'h4', 'li']):
                        txt = clean(c.get_text(' '))
                        if txt: add({'t': 'p', 'text': txt})
                    else:
                        visit(c)
        visit(root)
        JUNK_SECTIONS = ('روابط خارجية', 'وصلات خارجية', 'انظر أيضا', 'مصادر', 'المراجع', 'هوامش')
        JUNK_P = re.compile(r'^(هامش|استمع للقصيدة|تحقيق وتدقيق:.*)$')
        for s in sections:
            s['items'] = [i for i in s['items'] if not (i['t'] == 'p' and JUNK_P.match(i['text']))]
        sections = [s for s in sections if s['items'] and s['title'] not in JUNK_SECTIONS]
        nb = sum(1 for s in sections for i in s['items'] if i['t'] == 'b')
        npar = sum(1 for s in sections for i in s['items'] if i['t'] == 'p')
        doc = {
            'id': key, 'title': title, 'author': author, 'category': cat, 'kind': kind,
            'vocalized': bool(re.search('[ً-ْ]', json.dumps(sections, ensure_ascii=False)[:4000])),
            'source': {'name': 'ويكي مصدر (Wikisource)', 'page': raw['title'], 'revid': raw['revid'],
                       'url': 'https://ar.wikisource.org/w/index.php?oldid=' + str(raw['revid']), 'license': 'CC BY-SA 4.0'},
            'sections': sections,
        }
        json.dump(doc, open(os.path.join(outdir, key + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'id': key, 'title': title, 'author': author, 'category': cat, 'kind': kind,
                      'sections': len(sections), 'abyat': nb, 'paragraphs': npar})
        print(f'{key}: sections={len(sections)} abyat={nb} paragraphs={npar}')
    json.dump(index, open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    if sys.argv[1] == 'fetch': fetch(sys.argv[2])
    else: build(sys.argv[2], sys.argv[3])
