import { disposeStartupBackground, startupAssetPath } from './startupMedia.js';

export const startupLobbyModes = [
    { label: '斗地主', mode: 'doudizhu', className: 'landlord', x: 1607, y: 398, width: 317, height: 457 },
    { label: '排位赛', mode: 'versus', className: 'rank', x: 1941, y: 398, width: 313, height: 527 },
    { label: '经典场', mode: 'identity', className: 'classic', x: 2275, y: 398, width: 327, height: 220 },
    { label: '活动场', mode: 'guozhan', className: 'activity', x: 2275, y: 634, width: 327, height: 220 },
];

// Coordinates follow the reference's 2760 × 1256 stage. A single transform
// preserves the original spacing, image aspect ratios and touch targets.
export function createStartupLobby({ lib, game, ui, get, _status, background }) {
    background.disposeLobby?.();
    background.lobby?.remove();
    background.classList.add('hh-startup-background');
    document.body.classList.add('hh-startup-active');
    const stage = document.createElement('div');
    stage.className = 'hh-startup-lobby';
    stage.setAttribute('aria-label', '游戏大厅');
    background.appendChild(stage);
    background.lobby = stage;
    let entering = false;
    let characterBrowser, openingCharacters = false;

    function syncCharacterZoom() {
        let zoom = game.documentZoom || 1;
        if (window.inSplash) {
            // The arena applies this setting after the splash. Use its same
            // accepted range now, without changing the game's initialization.
            const configured = Number.parseInt(lib.config.ui_zoom);
            const percent = configured >= 50 && configured <= 300 ? configured : 100;
            zoom = (game.deviceZoom || zoom) * percent / 100;
        }
        document.body.style.setProperty('--hh-startup-character-zoom', String(zoom));
    }
    function restoreLobby() {
        document.body.classList.remove('hh-startup-character-open');
        document.body.style.removeProperty?.('--hh-startup-character-zoom');
        stage.inert = false;
    }
    const afterGameResize = () => Promise.resolve().then(() => {
        if (stage.isConnected && document.body.classList.contains('hh-startup-character-open')) syncCharacterZoom();
    });
    lib.onresize?.push(afterGameResize);

    async function openCharacters() {
        if (entering || openingCharacters) return;
        openingCharacters = true;
        try {
            if (!characterBrowser) {
                const { createStartupCharacterBrowser } = await import('./startupCharacterBrowser.js');
                if (!stage.isConnected) return;
                characterBrowser = createStartupCharacterBrowser({ lib, game, ui, get, _status }, {
                    onClose: restoreLobby,
                });
            }
            // Use the same native body zoom as the in-game catalog. The lobby
            // alone opts out of this zoom to keep its video and stage full-screen.
            syncCharacterZoom();
            document.body.classList.add('hh-startup-character-open');
            characterBrowser.open();
            stage.inert = true;
        } catch (error) {
            characterBrowser?.close(); characterBrowser = undefined; restoreLobby();
            console.error('[HH优化] 武将界面加载失败', error);
            game.alert?.('武将界面加载失败，请重试');
        } finally { openingCharacters = false; }
    }

    function node(className, parent = stage, text) {
        const div = document.createElement('div');
        div.className = 'hh-lobby-' + className;
        if (text !== undefined) div.textContent = text;
        parent.appendChild(div);
        return div;
    }
    function place(element, x, y, width, height) {
        Object.assign(element.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
        return element;
    }
    function image(name, parent = stage, className = name) {
        const img = document.createElement('img');
        img.className = 'hh-lobby-' + className;
        img.src = lib.assetURL + startupAssetPath + 'lobby/' + name + '.webp';
        img.alt = '';
        img.draggable = false;
        parent.appendChild(img);
        return img;
    }
    function text(value, className, x, y, width, height) {
        return place(node(className, stage, value), x, y, width, height);
    }
    function feedback(className, label, parent = stage) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hh-lobby-feedback hh-lobby-' + className;
        button.setAttribute('aria-label', label);
        button.onclick = () => {
            if (entering) return;
            button.classList.remove('hh-lobby-tapped');
            // Restart the short press animation for every activation, including
            // keyboard clicks and repeated taps. No navigation or config writes.
            void button.offsetWidth;
            button.classList.add('hh-lobby-tapped');
        };
        parent.appendChild(button);
        return button;
    }
    function artButton(name, label, x, y, width, height, nativeBanner = false) {
        const button = place(feedback(name + '-button', label), x, y, width, height);
        image(name, button, nativeBanner ? 'banner-art' : 'feedback-art');
        return button;
    }
    function dot(x, y, count, parent = stage) {
        const red = place(node(count ? 'badge' : 'dot', parent), x, y, count ? 49 : 32, count ? 35 : 32);
        red.setAttribute('aria-hidden', 'true');
        if (count) red.textContent = count;
    }
    function icon(name, label, x, y, width, height, notify = false, glow = false) {
        const item = place(feedback('decoration', label), x, y, width, height);
        if (name === 'gift' || name === 'anniversary') image('button-back', item, 'icon-back');
        image(name, item, 'icon-art');
        if (glow) item.classList.add('hh-lobby-glowing');
        if (notify) dot(width * 0.72, -1, undefined, item);
        return item;
    }

    artButton('avatar', '头像', 172, 17, 141, 140);
    text('红薯', 'nickname', 340, 20, 250, 52);
    const member = place(feedback('member', '会员9'), 612, 25, 132, 48);
    place(image('member-label', member), 23.25, 7.5, 63, 33);
    place(image('member-level', member), 86.25, 9, 22.5, 30);
    const officer = place(feedback('officer-badge', '国护军'), 333, 76, 277, 88);
    place(image('officer-ribbon', officer), 12, 15, 265, 62);
    place(image('officer', officer), 0, 0, 88, 88);
    place(image('officer-title', officer), 89, 22, 164, 44);
    ['将', '风火', '标', '界', '谋', '武', '璀'].forEach((label, index) => {
        const tag = place(feedback('pack-tag', label + '武将包'), 616 + index * 52, 96, 37, 38);
        node('pack-label', tag, label);
        tag.dataset.pack = String(index);
    });
    function currency(name, value, x) {
        const box = place(node('currency'), x, 76, 297, 66);
        image('currency-bg', box, 'currency-bg');
        image(name, box, 'currency-icon');
        node('currency-value', box, value);
        const add = feedback('currency-add', name === 'silver' ? '增加银两' : '增加元宝', box);
        image('currency-add', add, 'feedback-art');
    }
    currency('silver', '537', 1520);
    currency('gold', '1268', 1873);
    icon('garden', '桃园', 2230, 70, 88, 96);
    icon('fortune', '发财', 2370, 70, 95, 96, true);
    const mail = icon('mail', '信件', 2512, 76, 91, 89);
    dot(55, -17, '9', mail);

    icon('gift', '活动', 180, 236, 138, 143, true, true);
    const anniversary = icon('anniversary', '周年庆', 346, 236, 139, 143, true, true);
    place(node('icon-label', anniversary, '周年庆'), 0, 113, 139, 44);
    place(node('date-tag', anniversary, '12.5'), 66, 65, 85, 34);
    icon('welfare', '福利', 184, 434, 136, 144, true);
    icon('task', '任务', 187, 628, 135, 146, true);
    icon('contest', '赛事', 187, 822, 134, 147);

    artButton('promotion', '八人匹配', 2105, 243, 483, 128, true);
    const dots = place(node('carousel-dots'), 2312, 371, 70, 19);
    for (let i = 0; i < 3; i++) feedback(i === 2 ? 'carousel-dot active' : 'carousel-dot', '活动轮播' + (i + 1), dots);

    for (const [index, entry] of startupLobbyModes.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hh-lobby-mode hh-lobby-' + entry.className;
        button.dataset.mode = entry.mode;
        button.setAttribute('aria-label', entry.label);
        button.disabled = !lib.mode[entry.mode];
        place(button, entry.x, entry.y, entry.width, entry.height);
        stage.appendChild(button);
        background['module' + (index + 1)] = button;
        image('mode-' + entry.className, button, 'mode-art');
        if (entry.className === 'rank') {
            image('rank-crest', button, 'rank-crest');
            node('rank-title', button, '枭雄');
            const stars = node('rank-stars', button);
            image('rank-star', stars, 'rank-star');
            node('rank-star-count', stars, '×3');
        }
        node('mode-caption', button, { landlord: '赢大奖', rank: '首胜奖励就绪', classic: '身份 国战', activity: '山河图' }[entry.className]);
        button.onclick = async () => {
            if (entering || button.disabled) return;
            entering = true;
            stage.classList.add('hh-lobby-entering');
            try {
                // Persist first so the reload cannot race IndexedDB on mobile.
                await game.promises.saveConfig('mode', entry.mode);
            } catch (error) {
                entering = false;
                stage.classList.remove('hh-lobby-entering');
                console.error('启动模式保存失败', error);
                return;
            }
            // Always-show splash must also enter the chosen mode on this reload.
            if (typeof localStorage !== 'undefined') localStorage.setItem(lib.configprefix + 'directstart', 'true');
            disposeStartupBackground(ui);
            game.reload();
        };
    }

    icon('bless', '祈福', 1648, 947, 119, 131, true);
    icon('treasure', '寻宝阁', 1810, 948, 122, 130);
    icon('wish', '祈愿台', 1975, 948, 122, 131);
    icon('scroll', '琳琅绘卷', 2121, 948, 151, 131);
    icon('rebate', '超值返利', 2298, 947, 146, 131, false, true);
    icon('shop', '商城', 2470, 948, 118, 133, false, true);

    node('bottom-shade');
    const chatButton = place(feedback('chat-button', '聊天'), 189, 1108, 102, 102);
    place(node('chat', chatButton), 15, 15, 72, 72);
    place(image('chat-bubble', chatButton, 'chat-bubble-native'), 20, 27, 62, 49);
    place(node('chat-dots', chatButton, '•••'), 25, 28, 52, 31);
    dot(63, -3, '11', chatButton);
    artButton('nostalgia', '三国斗地主', 380, 1092, 439, 128, true);
    const bottomItems = [
        ['武将', 'general', 1278, true], ['皮肤', 'skin', 1529, true],
        ['官阶', 'officer', 1780, true], ['招募', 'recruit', 2033, true],
        ['包裹', 'bag', 2287, false],
    ];
    for (const [label, name, x] of bottomItems) {
        const item = place(feedback('bottom-item', label), x, 1137, 226, 80);
        image('footer-' + name, item, 'bottom-art');
        if (name !== 'bag') node('bottom-separator', item);
        if (name === 'officer' || name === 'recruit') dot(168, -7, undefined, item);
        if (name === 'general') item.addEventListener('click', openCharacters);
    }
    icon('more', '更多', 2495, 1127, 96, 99, true);

    const resize = () => {
        const bounds = background.getBoundingClientRect();
        const scale = Math.min((background.clientWidth || bounds.width) / 2760, (background.clientHeight || bounds.height) / 1256);
        stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    };
    let observer;
    if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(resize);
        observer.observe(background);
    }
    window.addEventListener('resize', resize);
    background.disposeLobby = () => {
        characterBrowser?.close();
        const resizeIndex = lib.onresize?.indexOf(afterGameResize) ?? -1;
        if (resizeIndex >= 0) lib.onresize.splice(resizeIndex, 1);
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        document.body.classList.remove('hh-startup-active');
    };
    resize();
    return stage;
}
