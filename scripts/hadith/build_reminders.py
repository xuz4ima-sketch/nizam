"""Напоминания дня для главной: аяты и хадисы с переводами ТОЛЬКО из источников.

Аяты: текст Усмани, перевод Э. Кулиева (45) и Saheeh International (20) — Quran.com API.
Хадисы: арабский, русский и английский — fawazahmed0/hadith-api; номер Муслима проверяется по arabicnumber.
Запуск: python scripts/hadith/build_reminders.py src/data/reminders.json
"""
import json, re, sys, time, urllib.error, urllib.request

Q = 'https://api.quran.com/api/v4'
H = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions'

AYAT = [  # (сура, первый аят, последний аят, название суры по-русски/английски)
    (94, 5, 6, 'аш-Шарх', 'Ash-Sharh'),
    (20, 114, 114, 'Та Ха', 'Ta-Ha'),
    (13, 11, 11, 'ар-Раад', "Ar-Ra'd"),
    (29, 69, 69, 'аль-Анкабут', "Al-'Ankabut"),
    (103, 1, 3, 'аль-Аср', "Al-'Asr"),
]
HADITH = [  # (сборник, номер в издании, ожидаемый канонический номер)
    ('bukhari', 6464, '6464'),
    ('muslim', 6853, '2699'),
    ('bukhari', 6412, '6412'),
]

def get(url):
    for a in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'nizam'}), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 404: raise
            time.sleep(3 + 2 * a)
        except Exception:  # noqa: BLE001
            time.sleep(3 + 2 * a)
    raise SystemExit('не удалось: ' + url)

clean = lambda s: re.sub(r'<sup[^>]*>.*?</sup>', '', s).replace('<br>', ' ').strip()

def main(out):
    items = []
    for s, a1, a2, ru_name, en_name in AYAT:
        ar, ru, en = [], [], []
        for a in range(a1, a2 + 1):
            v = get(f'{Q}/verses/by_key/{s}:{a}?translations=45,20&fields=text_uthmani')['verse']
            tr = {t['resource_id']: clean(t['text']) for t in v['translations']}
            ar.append(v['text_uthmani']); ru.append(tr[45]); en.append(tr[20])
        ref = f'{s}:{a1}' + (f'–{a2}' if a2 != a1 else '')
        items.append({'kind': 'quran', 'ar': ' ۝ '.join(ar), 'ru': ' '.join(ru), 'en': ' '.join(en),
                      'source': {'ru': f'Коран, сура «{ru_name}», {ref} · перевод смыслов Э. Кулиева',
                                 'en': f"Qur'an, {en_name} {ref} · Saheeh International",
                                 'ar': f'سورة {get(f"{Q}/chapters/{s}")["chapter"]["name_arabic"]}، الآية {ref}'}})
        print('quran', ref)
    names = {'bukhari': ('аль-Бухари', 'al-Bukhari', 'البخاري'), 'muslim': ('Муслим', 'Muslim', 'مسلم')}
    for coll, n, canon in HADITH:
        ar = get(f'{H}/ara-{coll}/{n}.json')['hadiths'][0]
        got = str(ar.get('arabicnumber', n)).split('.')[0]
        if got != canon: raise SystemExit(f'номер не совпал: {coll} {n} → {got}, ожидалось {canon}')
        ru = get(f'{H}/rus-{coll}/{n}.json')['hadiths'][0]['text'].strip()
        en = get(f'{H}/eng-{coll}/{n}.json')['hadiths'][0]['text'].strip()
        ru_n, en_n, ar_n = names[coll]
        items.append({'kind': 'hadith', 'ar': ar['text'].strip(), 'ru': ru or None, 'en': en or None,
                      'source': {'ru': f'{ru_n}, № {canon}', 'en': f'{en_n}, no. {canon}', 'ar': f'رواه {ar_n} ({canon})'}})
        print(coll, n, canon, 'ru' if ru else '-')
    json.dump({'items': items}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main(sys.argv[1])
