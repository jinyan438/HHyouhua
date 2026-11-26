"""Import original win / loss / draw Spine animations and matching OGG cues."""
from pathlib import Path
import hashlib
import json
import re
import sys
import zipfile

source = Path(sys.argv[1] if len(sys.argv) > 1 else r'E:\AI\sanguosha')
output = Path(__file__).resolve().parents[1] / 'assets/game-result'
output.mkdir(parents=True, exist_ok=True)
paths = json.loads((source / 'sanguosha2/work/rx_pathmap_full.json').read_text('utf-8-sig'))
keys = {url: key for key, url in paths.items()}
files = []
with zipfile.ZipFile(source / 'sanguosha2/yoka.game_g_android_4.0.2.apk') as archive:
    def export(url, name):
        data = archive.read('assets/cache/https.__web.sanguosha.com_220_sgsolApp/' + keys[url])
        (output / name).write_bytes(data)
        files.append(dict(file=name, original_path=url, cache_key=keys[url], bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        return data

    for name, sound in [('Shengli', 'shengli'), ('ShiBai', 'shibai'), ('PingJu', 'pingju')]:
        base = f'FX_PaiJu_JieSuan_{name}_new'
        prefix = '/res/assets/animate/game/gameResult/'
        atlas = export(prefix + base + '.atlas.txt', base + '.atlas.txt').decode('utf-8')
        export(prefix + base + '.skel', base + '.skel')
        pages = re.findall(r'^([^\r\n]+\.png)\s*\r?\nsize:', atlas, re.M)
        assert pages, base
        for page in pages:
            export(prefix + page, page)
        export(f'/res/local/voice/ui/ui_zhandou{sound}.ogg', f'ui_zhandou{sound}.ogg')

(output / 'sources.json').write_text(json.dumps(dict(source=str(source),
    code='sanguosha2/work/main.js: class aps (ResultBeforeMVPWindow), JudgeWinLose / showResultEff / resultEffectShowComplete',
    files=files), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Result: {len(files)} original files, {sum(row["bytes"] for row in files):,} bytes')
