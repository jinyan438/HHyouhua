"""Import the client's chain state, release and elemental break effects."""
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json
import re
import subprocess
import sys
import zipfile

source = Path(sys.argv[1] if len(sys.argv) > 1 else r'E:\AI\sanguosha')
output = Path(__file__).resolve().parents[1] / 'assets/chain-effects'
output.mkdir(parents=True, exist_ok=True)
paths = json.loads((source / 'sanguosha2/work/rx_pathmap_full.json').read_text('utf-8-sig'))
keys = {url: key for key, url in paths.items()}
files = []
names = ['EF_Plot_TSLH2', 'EF_Plot_TSLH3', 'EF_Plot_tiesuo_02_H', 'EF_Plot_tiesuo_02_L', 'EF_Plot_tiesuo_02_B']
prefix = '/res/assets/animate/game/neweffect/'
with zipfile.ZipFile(source / 'sanguosha2/yoka.game_g_android_4.0.2.apk') as archive:
    def export(url, target):
        data = archive.read('assets/cache/https.__web.sanguosha.com_220_sgsolApp/' + keys[url])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        files.append(dict(file=target.relative_to(output).as_posix(), original_path=url,
                          cache_key=keys[url], bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        return data

    for name in names:
        folder = output / name
        atlas = export(prefix + name + '.atlas.txt', folder / (name + '.atlas.txt')).decode('utf-8')
        export(prefix + name + '.skel', folder / (name + '.skel'))
        for page in re.findall(r'^([^\r\n]+\.png)\s*\r?\nsize:', atlas, re.M):
            export(prefix + page, folder / page)

sounds = {}
for name in ['3d_85_spell1', '3d_85_spell2', '3d_85_spell4', '3d_85_broken_fire']:
    url = 'https://web.sanguosha.com/220/sgsolApp/res/runtime/m/voice/spelleffect/' + name + '.ogg'
    original = output / (name + '.ogg')
    if not original.exists():
        with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25) as response:
            data = response.read()
        assert data.startswith(b'OggS'), (url, data[:20])
        original.write_bytes(data)
    data = original.read_bytes()
    target = output / (name + '.mp3')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(original),
                    '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', '2', str(target)], check=True)
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                     'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(target)]))
    sounds[name] = dict(file=target.name, original_url=url, original_file=original.name,
                        original_sha256=hashlib.sha256(data).hexdigest(),
                        sha256=hashlib.sha256(target.read_bytes()).hexdigest(), **info)

client = source / 'sanguosha2/work/main.js'
text = client.read_text('utf-8')
evidence = []
for term, length in [('Owt(FM,"tiesuo",', 800), ('this.seatState.ID==iE.DATA_IS_CHARCARD_TAP', 1000),
                     ('clearTiesuoStayTimer(){', 510), ('playHurtEffect(t,i){', 480),
                     ('seat_EffectDropHp(t,i){', 480), ('ServerProxy_GsCUpdateHpNtf(t){', 1500)]:
    offset = text.index(term)
    evidence.append(dict(offset=offset, code=text[offset:offset + length]))
(output / 'sources.json').write_text(json.dumps(dict(source=str(source),
    client='sanguosha2/work/main.js', client_sha256=hashlib.sha256(client.read_bytes()).hexdigest(),
    evidence=evidence, files=files, sounds=sounds), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Imported {len(files)} animation files and {len(sounds)} audio cues into {output}')
