"""Подборка хадисов о ценности времени и порядке жизни.

Тексты НЕ набираются вручную: каждый хадис загружается по номеру из открытого набора
fawazahmed0/hadith-api (jsDelivr) на арабском, русском и английском. Для Муслима сохраняется
канонический номер (нумерация Абд аль-Баки) из поля arabicnumber; для ат-Тирмизи — оценки хадисоведов.

Запуск: python scripts/hadith/build_time_hadith.py src/data/hadith-time.json
"""
import json, sys, time, urllib.error, urllib.request

BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions'
# (сборник, номер в издании, тема)
SELECTION = [
    ('bukhari', 6412, 'time'),          # Две милости: здоровье и свободное время
    ('tirmidhi', 2417, 'account'),      # Спросят о жизни: на что потратил
    ('bukhari', 6416, 'time'),          # Будь в этом мире словно чужеземец; слова Ибн Умара
    ('muslim', 6774, 'benefit'),        # Будь усерден в том, что приносит пользу
    ('tirmidhi', 2317, 'benefit'),      # Оставлять то, что не касается
    ('muslim', 313, 'hasten'),          # Спешите совершать благие дела
    ('bukhari', 6417, 'hope'),          # Человек, его срок и надежды (чертёж)
    ('bukhari', 6418, 'hope'),          # Надежды и срок
    ('bukhari', 6419, 'hope'),          # Оправдание до шестидесяти лет
    ('bukhari', 6420, 'hope'),          # Сердце старика молодо в любви к миру и надеждах
    ('bukhari', 6464, 'order'),         # Самое любимое дело — постоянное
    ('bukhari', 6465, 'order'),         # Берите на себя посильное
    ('bukhari', 39, 'order'),           # Религия легка; утро, вечер и часть ночи
    ('tirmidhi', 2346, 'gratitude'),    # Кто проснулся в безопасности и здоровым
]

def get(ed, n):
    for a in range(8):
        try:
            d = json.load(urllib.request.urlopen(f'{BASE}/{ed}/{n}.json', timeout=60))
            return d['hadiths'][0]
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(4 + 3 * a)
        except Exception:  # noqa: BLE001 — сетевые сбои: повторяем
            time.sleep(4 + 3 * a)
    raise SystemExit(f'не удалось загрузить {ed} {n}')

def main(out):
    items = []
    for coll, n, theme in SELECTION:
        ar = get(f'ara-{coll}', n)
        ru = get(f'rus-{coll}', n) if coll in ('bukhari', 'muslim') else None
        en = get(f'eng-{coll}', n)
        if not ar: raise SystemExit(f'нет арабского текста: {coll} {n}')
        canon = ar.get('arabicnumber', n)
        items.append({
            'id': f'{coll}-{n}', 'collection': coll, 'number': n, 'canonical': str(canon), 'theme': theme,
            'reference': ar.get('reference'),
            'grades': (en or ar).get('grades') or [],
            'ar': ar['text'].strip(),
            'ru': (ru['text'].strip() if ru and ru['text'].strip() else None),
            'en': (en['text'].strip() if en and en['text'].strip() else None),
        })
        print(coll, n, canon, 'ru' if items[-1]['ru'] else '-', 'en' if items[-1]['en'] else '-')
    json.dump({'source': {'name': 'fawazahmed0/hadith-api', 'url': 'https://github.com/fawazahmed0/hadith-api', 'license': 'Unlicense'},
               'items': items}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main(sys.argv[1])
