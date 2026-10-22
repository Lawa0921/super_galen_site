"""One-off, idempotent: rename the old `portrait-hurt` assets to `portrait-hit` and add the new mood entries to registry.json."""
from pathlib import Path
import json, sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed_registry  # noqa: E402

AF = Path(__file__).resolve().parents[1]
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')


def rename_tree(old, new):
    for root in (RAW, AF / 'work'):
        src = root / old
        if src.exists():
            for f in src.iterdir():
                if old in f.name: f.rename(f.with_name(f.name.replace(old, new)))
            src.rename(root / new)
    pf = AF / 'prompts' / f'{old}.txt'
    if pf.exists(): pf.rename(pf.with_name(f'{new}.txt'))


reg_path = AF / 'registry.json'
reg = json.loads(reg_path.read_text(encoding='utf-8'))
want = seed_registry.build()['assets']
for c in seed_registry.CHARS:
    old, new = f'char-{c}-portrait-hurt', f'char-{c}-portrait-hit'
    if old in reg['assets']:
        rename_tree(old, new)
        entry = reg['assets'].pop(old)
        entry['runtime'] = want[new]['runtime']
        for k in ('final', 'raw'):
            if k in entry: entry[k] = entry[k].replace(old, new)
        reg['assets'][new] = entry
for aid, entry in want.items():
    reg['assets'].setdefault(aid, entry)
reg_path.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(len([a for a in reg['assets'].values() if 'runtime' in a]), 'runtime assets')
