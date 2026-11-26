"""Import the local client's MVP artwork, original Spine tracks and OGG voice."""
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1] if len(sys.argv) > 1 else r'E:\AI\sanguosha')
output = Path(__file__).resolve().parents[1] / 'assets/mvp-fullscreen'
output.mkdir(parents=True, exist_ok=True)
paths = json.loads((source / 'sanguosha2/work/rx_pathmap_full.json').read_text('utf-8-sig'))
keys = {value: key for key, value in paths.items()}
records = []
with zipfile.ZipFile(source / 'sanguosha2/yoka.game_g_android_4.0.2.apk') as archive:
    def read(url):
        return archive.read('assets/cache/https.__web.sanguosha.com_220_sgsolApp/' + keys[url])

    def write(name, data, url, **extra):
        (output / name).write_bytes(data)
        records.append(dict(file=name, original_path=url, cache_key=keys[url], bytes=len(data),
                            sha256=hashlib.sha256(data).hexdigest(), **extra))

    for name in ['FX_PaiJu_JieSuan_kuang', 'FX_PaiJu_JieSuan_QCZJ']:
        for suffix in ['.skel', '.atlas.txt', '.png']:
            url = '/res/assets/animate/game/gameResult/' + name + suffix
            write(name + suffix, read(url), url)
    for name, url in [
        ('background.png', '/res/assets/BigBg/window_gameresult_mvp_bg.png'),
        ('ui_quanchangzuijia.ogg', '/res/local/voice/ui/ui_quanchangzuijia.ogg'),
    ]:
        write(name, read(url), url)

    def crop(name, image_url, box, **extra):
        image = Image.open(io.BytesIO(read(image_url))).crop(box)
        data = io.BytesIO()
        image.save(data, format='PNG')
        write(name, data.getvalue(), image_url, crop=list(box), **extra)

    url = '/res/assets/gameResult/gameMVP.png'
    atlas = json.loads(read('/res/assets/gameResult/gameMVP.atlas'))
    frame = atlas['frames']['mvp_User_Info.png']['frame']
    crop('user-info.png', url, (frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h']))
    crop('title.png', '/res/assets/animate/game/gameResult/FX_PaiJu_JieSuan_QCZJ.png', (397, 97, 717, 254))
    # Restore the first rotated and trimmed atlas region for the no-WebGL fallback.
    url = '/res/assets/animate/game/gameResult/FX_PaiJu_JieSuan_kuang.png'
    image = Image.open(io.BytesIO(read(url))).crop((388, 600, 772, 896)).transpose(Image.Transpose.ROTATE_90)
    canvas = Image.new('RGBA', (512, 512))
    canvas.paste(image, (108, 512 - 68 - 384))
    data = io.BytesIO(); canvas.save(data, format='PNG')
    write('border.png', data.getvalue(), url, crop=[388, 600, 772, 896], rotation=90, original_size=[512, 512])

(output / 'sources.json').write_text(json.dumps(dict(
    source=str(source), apk='sanguosha2/yoka.game_g_android_4.0.2.apk',
    code='sanguosha2/work/main.js: class T4i (GameMvpWindow)', files=records,
), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'MVP: {len(records)} files, {sum(row["bytes"] for row in records):,} bytes')
