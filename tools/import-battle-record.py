"""Extract the original GameZhanJiWindow atlas and untrimmed PNG sprites."""
from pathlib import Path
import hashlib
import io
import json
import sys
import zipfile
from PIL import Image

source = Path(sys.argv[1] if len(sys.argv) > 1 else r'E:\AI\sanguosha')
output = Path(__file__).resolve().parents[1] / 'assets/battle-record'
output.mkdir(parents=True, exist_ok=True)
paths = json.loads((source / 'sanguosha2/work/rx_pathmap_full.json').read_text('utf-8-sig'))
keys = {url: key for key, url in paths.items()}
files, sprites = [], []
with zipfile.ZipFile(source / 'sanguosha2/yoka.game_g_android_4.0.2.apk') as archive:
    def original(url, filename):
        data = archive.read('assets/cache/https.__web.sanguosha.com_220_sgsolApp/' + keys[url])
        (output / filename).write_bytes(data)
        files.append(dict(file=filename, original_path=url, cache_key=keys[url], bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        return data

    atlas = json.loads(original('/res/assets/gameResult/gameResult.atlas', 'gameResult.atlas.json'))
    sheet = Image.open(io.BytesIO(original('/res/assets/gameResult/gameResult.png', 'gameResult.png'))).convert('RGBA')
    for name, entry in atlas['frames'].items():
        frame, size, offset = entry['frame'], entry['sourceSize'], entry['spriteSourceSize']
        assert not entry.get('rotated'), name
        tile = sheet.crop((frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h']))
        image = Image.new('RGBA', (size['w'], size['h']))
        image.paste(tile, (offset['x'], offset['y']))
        image.save(output / name)
        data = (output / name).read_bytes()
        sprites.append(dict(file=name, atlas='gameResult.atlas.json', frame=frame, size=[size['w'], size['h']], sha256=hashlib.sha256(data).hexdigest()))

(output / 'sources.json').write_text(json.dumps(dict(source=str(source),
    code=dict(window='main.js: ffs (GameZhanJiWindow) extends nZi', row='hZi extends Zzt',
              entry='Vji.clickZhanji / aps.OnOpenZhanJi', scores='CU.ReadProto / CU.Read: signed protocol scores divided by 10; no client calculation'),
    files=files, sprites=sprites), ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'{len(files)} original files; {len(sprites)} sprites')
