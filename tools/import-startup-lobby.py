"""Import original lobby atlases and explicitly identified artwork fallbacks."""
from pathlib import Path
import json
from io import BytesIO
from fontTools.ttLib import TTFont
from fontTools import subset
from PIL import Image
from hashlib import sha256

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'E:/AI/sanguosha/extract/unity')
PICTURE = SOURCE / 'sprite/assets/res/picture'
LAYA = Path(r'E:/AI/sanguosha/extract/laya')
OUT = ROOT / 'assets/startup/lobby'
OUT.mkdir(parents=True, exist_ok=True)
records = {}

def write(name, image, record, trim=True):
    if trim:
        box = image.getchannel('A').getbbox()
        if box:
            image = image.crop(box)
            record['alpha_crop'] = list(box)
    image.save(OUT / (name + '.webp'), lossless=True)
    record['size'] = list(image.size)
    record['sha256'] = sha256((OUT / (name + '.webp')).read_bytes()).hexdigest()
    records[name + '.webp'] = record


def save(name, source, crop=None, kind='native-sprite'):
    image = Image.open(source).convert('RGBA')
    if crop:
        image = image.crop(crop)
    write(name, image, {'kind': kind, 'source': str(source), 'crop': crop,
        'source_sha256': sha256(source.read_bytes()).hexdigest()})


def atlas(name, image_key, atlas_key, filename, crop=None, panel=False):
    source = LAYA / 'atlas_png' / (image_key + '.png')
    metadata = LAYA / 'other' / (atlas_key + '.json')
    item = json.loads(metadata.read_text(encoding='utf-8'))['frames'][filename]
    f = item['frame']
    assert f.get('idx', 0) == 0 and not item.get('rotated'), filename
    image = Image.open(source).convert('RGBA').crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    if crop:
        image = image.crop(crop)
    # Trim the native panel's outer shadow to retain the reference's visible
    # card bounds. The lobby applies its own shadow outside the clickable panel.
    if panel:
        bounds = image.getchannel('A').point(lambda alpha: 255 if alpha >= 128 else 0).getbbox()
        image = image.crop(bounds)
    else:
        bounds = None
    write(name, image, {'kind': 'native-atlas', 'source': str(source), 'atlas': str(metadata),
        'sprite': filename, 'frame': item, 'crop': crop, 'panel_bounds': bounds,
        'source_sha256': sha256(source.read_bytes()).hexdigest()}, trim=not panel)


# The Android cache's mainUI atlas matches the reference lobby. Its file names
# are recovered from sanguosha2/work/rx_pathmap_full.json; do not use the
# automatic preview index's approximate atlas/image pairings.
main = {
    'fortune': 'btnIcon_161.png', 'garden': 'btnIcon_36.png', 'mail': 'btnIcon_10026.png',
    'task': 'btnIcon_2.png', 'contest': 'btnIcon_10060.png', 'bless': 'btnIcon_24.png',
    'treasure': 'btnIcon_75.png', 'wish': 'btnIcon_59.png', 'scroll': 'btnIcon_51.png',
    'rebate': 'btnIcon_56_new.png', 'shop': 'btnIcon_10031.png', 'more': 'mainui_btn_more.png',
    'footer-general': 'btnIcon_10014.png', 'footer-skin': 'btnIcon_10041.png',
    'footer-officer': 'btnIcon_10021.png', 'footer-recruit': 'btnIcon_10029.png',
    'footer-bag': 'btnIcon_10034.png', 'gift': 'btnIcon_3.png', 'welfare': 'btnIcon_4.png',
    'notice-dot': 'mainui_red.png', 'notice-count': 'mainui_red2.png',
    'date-tag': 'mainui_bottom_tag1.png',
    'chat-bubble': 'mainui_bottom_tag2.png',
    'carousel-idle': 'mainui_point_gray.png', 'carousel-active': 'mainui_point_light.png',
    'rank-star': 'mainui_star_new_2.png', 'button-back': 'mainui_commonbtn_di.png',
}
for name, filename in main.items():
    atlas(name, '1104cb4d', 'd323b5c3', filename)
atlas('anniversary', '1104cb4d', 'd323b5c3', 'btnIcon_10172.png', crop=(0, 0, 96, 65))
for name, filename in {'landlord': 'mainui_mode_icon4.png', 'rank': 'mainui_mode_icon2.png',
        'classic': 'mainui_mode_icon3.png', 'activity': 'mainui_mode_icon1.png'}.items():
    atlas('mode-' + name, '1104cb4d', 'd323b5c3', filename, panel=True)
atlas('rank-crest', '26eaff35', '15718566', 'rk_icon_ty_6.png')

for name, relative in {
    'officer': 'officer/big/b_7.png', 'officer-ribbon': 'officer/officername/mainofficer_bg2.png',
    'officer-title': 'officer/officername/mainofficer7.png',
    'currency-bg': 'baseui/coin_bg.png', 'currency-add': 'baseui/add_new.png',
}.items():
    save(name, PICTURE / relative)

money = SOURCE / 'texture/assets/res/fontassets/spriteassets/money/money.png'
money_meta = json.loads((SOURCE / 'text/assets/res/fontassets/spriteassets/money/money.json').read_text(encoding='utf-8'))
for name, filename in [('silver', 'yl_icon.png'), ('gold', 'yb_icon_tongyong.png')]:
    item = next(item for item in money_meta['frames'] if item['filename'] == filename)
    f = item['frame']
    image = Image.open(money).convert('RGBA')
    width, height = (f['h'], f['w']) if item['rotated'] else (f['w'], f['h'])
    image = image.crop((f['x'], f['y'], f['x'] + width, f['y'] + height))
    if item['rotated']:
        image = image.transpose(Image.Transpose.ROTATE_90)
    image.save(OUT / (name + '.webp'), lossless=True)
    records[name + '.webp'] = {'kind': 'native-atlas', 'source': str(money), 'frame': item, 'size': list(image.size), 'source_sha256': sha256(money.read_bytes()).hexdigest(), 'sha256': sha256((OUT / (name + '.webp')).read_bytes()).hexdigest()}

# These account/event pictures have no verified same-version original in the
# available caches. Retain and explicitly identify just these three fallbacks.
reference = Path(r'E:/.cache/TEMP/codex-clipboard-adeffdf0-32f4-4e94-9d7c-198ce9c33908.jpg')
save('avatar', reference, (172, 17, 313, 157), kind='reference-fallback')
save('promotion', reference, (2105, 243, 2588, 371), kind='reference-fallback')
save('nostalgia', reference, (380, 1092, 819, 1220), kind='reference-fallback')

font_source = SOURCE / 'meta/assets/third/textmesh pro/fonts/hyxlsj.ttf.json'
font = TTFont(BytesIO(bytes(json.loads(font_source.read_text(encoding='utf-8'))['m_FontData'])), recalcTimestamp=False)
options = subset.Options()
options.flavor = 'woff2'
subsetter = subset.Subsetter(options=options)
labels = (ROOT / 'src/ui/startupLobby.js').read_text(encoding='utf-8')
subsetter.populate(text=labels + ''.join(chr(i) for i in range(32,127)))
subsetter.subset(font)
font.flavor = 'woff2'
font.save(OUT / 'HYXLSJ.woff2')
records['HYXLSJ.woff2'] = {'kind': 'native-font', 'source': str(font_source), 'source_sha256': sha256(font_source.read_bytes()).hexdigest(), 'subset': 'startupLobby.js and printable ASCII', 'sha256': sha256((OUT / 'HYXLSJ.woff2').read_bytes()).hexdigest()}

(OUT / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Imported {len(records)} lobby assets')
