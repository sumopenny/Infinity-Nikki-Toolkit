"""Build image filename maps from verified local export reports (no downloads).

Usage: python scripts/build-imagekit-maps.py D:/desktop/Output
Suit mappings are resource-code associations through catalog members, not decoded suit fields.
"""
import ast
import json
import re
import sys
from pathlib import Path

base = Path(sys.argv[1])
data = Path(__file__).resolve().parents[1] / 'src/data'
content = base / 'Exports/X6Game/Content'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


records = read(base / 'LocalizationAnalysis/item-mapping/item-v2-records.json')
icons = {p.name.lower(): p.name for p in (content / 'UI/Image/IconClothes').rglob('*.png')}
icon_map = read(data / 'wardrobe/itemIconMap.json')
for row in records:
    match = re.search(r'/IconClothes/([^/.]+)\.', row['imageReference'])
    if match and (match[1] + '.png').lower() in icons:
        name = icons[(match[1] + '.png').lower()]
        assert row['id'] not in icon_map or icon_map[row['id']] == name or icon_map[row['id']] == f"icon_{row['id']}.png"
        icon_map[row['id']] = name
assert icon_map, 'No IconClothes exports found'
write(data / 'wardrobe/itemIconMap.json', icon_map)

item_map = read(data / 'wardrobe/itemImageMap.json')
local_items = {p.name.lower(): p.name for p in (content / 'UI/Image/Showpic').rglob('*.png')}
for key, value in list(item_map.items()):
    if key.isdigit() and isinstance(value, str) and value.lower() in local_items:
        item_map[key] = local_items[value.lower()]
write(data / 'wardrobe/itemImageMap.json', item_map)
suits = {p.name.lower(): p.name for p in (content / 'UI/Image/SuitShowPic').rglob('*.png')}
suit_map = read(data / 'wardrobe/outfitImageMap.json')
missing = []
for outfit_id, members in read(data / 'gongeo/outfitItems.json'):
    codes = set()
    for member in members:
        match = re.fullmatch(r'T_showpic_clothes_(SL?\d{4})[A-Za-z]+(?:_SkMesh)?(_LV\d+)?(?:_SkMesh)?\.png', item_map.get(str(member), ''), re.I)
        if match:
            codes.add(match[1] + (match[2] or ''))
    name = 'T_showpic_suit_' + next(iter(codes)) + '.png' if len(codes) == 1 else ''
    if name.lower() in suits:
        suit_map[str(outfit_id)] = suits[name.lower()]
    else:
        missing.append(outfit_id)
write(data / 'wardrobe/outfitImageMap.json', suit_map)

# Load only the locres reader definitions, never the extraction script's write operations.
parser = base / 'LocalizationAnalysis/build-full-item-mapping.py'
tree = ast.parse(parser.read_text(encoding='utf-8'))
namespace = {'BASE': base}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.ClassDef, ast.FunctionDef))], type_ignores=[]), str(parser), 'exec'), namespace)
zh = namespace['loc']('zh')[0]
en = namespace['loc']('en')[0]
photo = read(data / 'photo/photoResourceCatalog.json')
index = {e['key']: e for e in photo['resources']['pose']}
for row in records:
    match = re.search(r'/Anim_Momo/([^/.]+)\.', row['imageReference'])
    if not match:
        continue
    filename = match[1] + '.png'
    assert (content / 'UI/Image/Icon/Anim_Momo' / filename).is_file()
    key = row['id']
    assert key in zh and key in en
    entry = index.get(key)
    if entry is None:
        entry = {'key': key, 'aliases': [key], 'zh': zh[key].strip(), 'en': en[key].strip()}
        photo['resources']['pose'].append(entry)
        index[key] = entry
    entry['image'] = 'momo-poses/' + filename
photo['source']['pose'] = 'imagekit-2026-11-06-v1'
write(data / 'photo/photoResourceCatalog.json', photo)
print(json.dumps({'icons': len(icon_map), 'outfits': len(suit_map), 'unmappedOutfits': missing, 'poses': len(index)}))
