"""Import original country-war selection sprites from the local client export."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

CLIENT = Path(r'E:\AI\sanguosha')
TARGET = Path(__file__).resolve().parents[1] / 'assets' / 'guozhan-selection'
TARGET.mkdir(parents=True, exist_ok=True)
records = []
for descriptor, atlas, name in [
    ('a5657326', '29c23dcc', 'xuan_jiang_da_di.png'),
    ('71445296', '8723e84d', 'secbtn_nrm.png'),
]:
    base = CLIENT / 'extract' / 'laya'
    desc = base / 'other' / f'{descriptor}.json'
    frame = json.loads(desc.read_text('utf-8'))['frames'][name]['frame']
    source = base / 'atlas_png' / f'{atlas}.png'
    image = Image.open(source)
    x, y, w, h = (frame[key] for key in ['x', 'y', 'w', 'h'])
    image.crop((x, y, x + w, y + h)).save(TARGET / name)
    records.append({'file': name, 'source': str(source), 'descriptor': str(desc), 'frame': [x, y, w, h]})
source = CLIENT / 'unpacked-wg' / '201efc6dacf2864c_ec5630db06b5eccb' / 'Sprite' / 'countryGeneralBg.png'
shutil.copy2(source, TARGET / source.name)
records.append({'file': source.name, 'source': str(source)})
for record in records:
    record['sha256'] = hashlib.sha256((TARGET / record['file']).read_bytes()).hexdigest()
manifest = {
    'client': str(CLIENT),
    'logic': 'sanguosha2/work/main.js: Sws (SelectCountryWarGeneralWindow), dRs (layout)',
    'methods': ['onClickGeneralCard', 'clearSelectGeneral', 'checkGeneralCountry', 'confirmBtnEvent'],
    'animation': {'kind': 'Laya.Tween', 'duration': 300, 'easing': 'Laya.Ease.sineOut'},
    'files': records,
}
(TARGET / 'sources.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(f'Imported {len(records)} original sprites into {TARGET}')
