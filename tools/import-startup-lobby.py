"""Import the native Sanguosha lobby sprites and supplied event artwork."""
from pathlib import Path
import json
from io import BytesIO
from fontTools.ttLib import TTFont
from fontTools import subset
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'E:/AI/sanguosha/extract/unity')
PICTURE = SOURCE / 'sprite/assets/res/picture'
OUT = ROOT / 'assets/startup/lobby'
OUT.mkdir(parents=True, exist_ok=True)
records = {}

def save(name, source, crop=None, polygon=None):
    image = Image.open(source).convert('RGBA')
    if crop:
        image = image.crop(crop)
    if polygon:
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
    box = image.getbbox()
    if box:
        image = image.crop(box)
    image.save(OUT / (name + '.webp'), lossless=True)
    records[name + '.webp'] = {'source': str(source), 'crop': crop, 'polygon': polygon, 'size': list(image.size)}

native = {
    'fortune': 'mainui/btnicon_161.png',
    'garden': 'mainui/btnicon_36.png',
    'mail': 'mainui/mail_btn_normal.png',
    'task': 'mainui/task_btn_normal.png',
    'contest': 'mainui/match_btn_normal.png',
    'bless': 'mainui/bless_btn_normal.png',
    'treasure': 'mainui/xbg_btn_normal.png',
    'wish': 'mainui/btnicon_178.png',
    'scroll': 'mainui/btnicon_179.png',
    'rebate': 'mainui/btnicon_56_new.png',
    'shop': 'mainui/shop_btn_normal2.png',
    'more': 'mainui/more_menu_btn_normal.png',
    'officer': 'officer/big/b_7.png',
    'officer-ribbon': 'officer/officername/mainofficer_bg2.png',
    'officer-title': 'officer/officername/mainofficer7.png',
    'currency-bg': 'baseui/coin_bg.png',
    'currency-add': 'baseui/add_new.png',
}
for name, relative in native.items():
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
    records[name + '.webp'] = {'source': str(money), 'frame': item}

# These time-limited pictures are supplied by the reference; the installed
# client contains different promotions. Keep them separate from native sprites.
reference = Path(r'E:/.cache/TEMP/codex-clipboard-adeffdf0-32f4-4e94-9d7c-198ce9c33908.jpg')
save('avatar', reference, (172,17,313,157))
save('promotion', reference, (2105,243,2588,371))
save('nostalgia', reference, (380,1092,819,1220))
# The reference differs from the locally cached patterned cards. Preserve its
# opaque card faces, while keeping the rest of the lobby as separate sprites.
save('mode-landlord', reference, (1607,398,1924,855))
save('mode-rank', reference, (1941,398,2254,925), [(0,0),(312,0),(312,457),(157,526),(0,457)])
save('mode-classic', reference, (2275,398,2602,618))
save('mode-activity', reference, (2275,634,2602,854))
save('footer-general', reference, (1286,1136,1355,1211), [(34,0),(68,37),(34,74),(0,37)])
save('footer-skin', reference, (1530,1136,1614,1215), [(42,0),(83,39),(42,78),(0,39)])
save('footer-officer', reference, (1782,1137,1861,1214), [(39,0),(78,38),(39,76),(0,38)])
save('footer-recruit', reference, (2033,1136,2112,1214), [(39,0),(78,39),(39,77),(0,39)])
save('footer-bag', reference, (2287,1140,2368,1212), [(40,0),(80,36),(40,71),(0,36)])
save('welfare', reference, (184,433,320,542), [(68,0),(135,68),(98,108),(38,108),(0,68)])
save('gift', reference, (181,235,319,350), [(68,0),(137,68),(94,114),(44,114),(0,68)])
save('anniversary', reference, (346,235,485,350), [(68,0),(138,68),(94,114),(44,114),(0,68)])

font_source = SOURCE / 'meta/assets/third/textmesh pro/fonts/hyxlsj.ttf.json'
font = TTFont(BytesIO(bytes(json.loads(font_source.read_text(encoding='utf-8'))['m_FontData'])))
options = subset.Options()
options.flavor = 'woff2'
subsetter = subset.Subsetter(options=options)
labels = (ROOT / 'src/ui/startupLobby.js').read_text(encoding='utf-8')
subsetter.populate(text=labels + ''.join(chr(i) for i in range(32,127)))
subsetter.subset(font)
font.flavor = 'woff2'
font.save(OUT / 'HYXLSJ.woff2')
records['HYXLSJ.woff2'] = {'source': str(font_source), 'subset': 'startupLobby.js and printable ASCII'}

(OUT / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Imported {len(records)} lobby assets')
