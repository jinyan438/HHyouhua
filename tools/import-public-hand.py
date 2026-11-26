"""Import ShowHandCardTip's original nine-slice image and client logic."""
from pathlib import Path
import hashlib
import io
import json
import zipfile
from PIL import Image

CLIENT = Path(r'E:\AI\sanguosha')
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/public-hand'
DEST.mkdir(parents=True, exist_ok=True)
paths = json.loads((CLIENT / 'sanguosha2/work/rx_pathmap_full.json').read_text('utf-8-sig'))
keys = {url: key for key, url in paths.items()}
files, atlases = [], []
with zipfile.ZipFile(CLIENT / 'sanguosha2/yoka.game_g_android_4.0.2.apk') as package:
    def original(url):
        key = keys[url]
        data = package.read('assets/cache/https.__web.sanguosha.com_220_sgsolApp/' + key)
        return data, dict(path=url, cacheKey=key, sha256=hashlib.sha256(data).hexdigest())

    for atlas_name, filename in [('seat', 'skillTipShowBg.png'), ('seatBottom', 'other_hand_card_bg.png')]:
        atlas_data, atlas_source = original(f'/res/assets/game/{atlas_name}.atlas')
        image_data, image_source = original(f'/res/assets/game/{atlas_name}.png')
        atlases.append(dict(image=image_source, atlas=atlas_source))
        entry = json.loads(atlas_data)['frames'][filename]
        rect, size, offset = entry['frame'], entry['sourceSize'], entry['spriteSourceSize']
        assert not entry.get('rotated')
        image = Image.open(io.BytesIO(image_data)).convert('RGBA')
        piece = image.crop((rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h']))
        result = Image.new('RGBA', (size['w'], size['h']))
        result.paste(piece, (offset['x'], offset['y']))
        result.save(DEST / filename)
        files.append(dict(file=filename, atlas=atlas_source['path'], frame=rect, size=[size['w'], size['h']],
                          offset=offset, sha256=hashlib.sha256((DEST / filename).read_bytes()).hexdigest()))

code_path = CLIENT / 'sanguosha2/work/main.js'
code = code_path.read_text('utf-8')
classes = {}
for name in ['Sns', 'Ins', 'pns', 'Oki']:
    start = code.index('class ' + name + ' extends ')
    end = code.index('class ', start + 6)
    classes[name] = code[start:end]
text_start = code.index('class jx extends')
factory_start = code.index('static Create(', text_start)
factory_end = code.index('static ChangeStyle(', factory_start)
snapshot = dict(source=str(code_path), sha256=hashlib.sha256(code_path.read_bytes()).hexdigest(), classes=classes,
                textFactory=code[factory_start:factory_end], fontConstant='Owt(rB,"SemiBold","fzlbgbk")')
(ROOT / 'tests/fixtures/original-public-hand.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
manifest = dict(source=str(CLIENT), image=atlases[0]['image'], atlas=atlases[0]['atlas'], atlases=atlases, files=files,
    logic=dict(source=str(code_path), sha256=snapshot['sha256'],
               classes=['Sns (ShowHandCardTip)', 'Ins (teammate hand)', 'pns (card-count entry)', 'Oki (persistent hand summary)'],
               summary=dict(size=[47, 108], grid=[4, 4, 4, 4], lines=4, ellipsisFrom=5,
                            text=dict(fontFamily='fzlbgbk', cssFamily='hh-source-public-hand', file='../general-font/FZLBGBK.woff2', fontSize=20,
                                      color='#CCB78E', bold=False, letterSpacing=1, leading=0, top=5,
                                      width=47, height=108, moreFontSize=22, moreTop=78, moreHeight=30),
                            backgroundAffectsTextLayout=False),
               grid=[30, 30, 30, 30], cardSize=[126, 174], cardScale=.85, columns=4, gap=6,
               opening=dict(duration=200, easing='expoOut'), closing=dict(duration=150, easing='quadOut'),
               sound=None))
(DEST / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Imported two original hand-view sprites and four original client classes')
