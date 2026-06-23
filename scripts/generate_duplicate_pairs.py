import json, re
from pathlib import Path

def load(p):
    return json.loads(Path(p).read_text())

def norm_title(t):
    if not t: return ''
    t = t.lower()
    t = re.sub(r"[^a-z0-9 ]+", ' ', t)
    t = re.sub(r"\s+", ' ', t).strip()
    return t

A = load('public/BNClassics.json')
B = load('public/BNClassics_Update.json')

map_a = {}
for e in A:
    k = norm_title(e.get('Title') or e.get('FULL TITLE') or '')
    if not k: continue
    map_a.setdefault(k, []).append(e)

map_b = {}
for e in B:
    k = norm_title(e.get('Title') or e.get('FULL TITLE') or '')
    if not k: continue
    map_b.setdefault(k, []).append(e)

common = sorted(set(map_a.keys()) & set(map_b.keys()))

pairs = []
for k in common:
    pairs.append({
        'norm_title': k,
        'display_title': (map_a[k][0].get('Title') or map_b[k][0].get('Title') or k),
        'entries_a': map_a[k],
        'entries_b': map_b[k]
    })

out = {
    'count_a': len(A),
    'count_b': len(B),
    'common_title_count': len(common),
    'pairs': pairs
}

Path('public/duplicates_pairs.json').write_text(json.dumps(out, indent=2))
print('Wrote public/duplicates_pairs.json with', len(pairs), 'pairs')
