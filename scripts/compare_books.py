import json
import re
from pathlib import Path

p1 = Path('public/BNClassics.json')
p2 = Path('public/BNClassics_Update.json')

def load(path):
    data = json.loads(path.read_text())
    return data


def norm_title(t):
    if not t: return ''
    t = t.lower()
    t = re.sub(r"[^a-z0-9 ]+", ' ', t)
    t = re.sub(r"\s+", ' ', t).strip()
    return t


def norm_isbn(isbn):
    if not isbn: return ''
    s = re.sub(r"[^0-9Xx]", '', str(isbn))
    return s


def map_by_title(entries):
    m = {}
    for e in entries:
        t = norm_title(e.get('Title') or e.get('FULL TITLE') or '')
        if t:
            m.setdefault(t, []).append(e)
    return m


def map_by_isbn(entries):
    m = {}
    for e in entries:
        for k in ('ISBN','EAN'):
            if k in e:
                s = norm_isbn(e.get(k))
                if s:
                    m.setdefault(s, []).append(e)
    return m


a = load(p1)
b = load(p2)

map_a_title = map_by_title(a)
map_b_title = map_by_title(b)
map_a_isbn = map_by_isbn(a)
map_b_isbn = map_by_isbn(b)

common_titles = sorted(set(map_a_title.keys()) & set(map_b_title.keys()))
common_isbns = sorted(set(map_a_isbn.keys()) & set(map_b_isbn.keys()))

report = {
    'count_a': len(a),
    'count_b': len(b),
    'common_title_count': len(common_titles),
    'common_isbn_count': len(common_isbns),
    'common_titles': common_titles[:200],
    'common_isbns': common_isbns[:200]
}

Path('public/duplicates_report.json').write_text(json.dumps(report, indent=2))
print('Wrote public/duplicates_report.json')
print('Counts:', report['count_a'], report['count_b'])
print('Common titles:', report['common_title_count'])
print('Common ISBNs:', report['common_isbn_count'])
