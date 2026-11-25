import { createCharacterBrowser } from './characterBrowser.js';
import { createCharacterPreviewAudio } from './characterPreviewAudio.js';
import { getPlayerStyleSizing, getPlayerStyleCss } from './playerStyleSizing.js';

// The splash runs before loadCharacter/loadExtension. Read the already imported
// metadata through a separate library view instead of running game initialization.
export function createStartupCharacterContext(context) {
    const { lib, get } = context;
    const library = Object.create(lib);
    const fields = ['character', 'characterPack', 'translate', 'skill', 'characterSort', 'characterIntro', 'characterSubstitute', 'characterGuide', 'characterStrategy'];
    for (const field of fields) library[field] = { ...lib[field] };

    function addPack(pack, extension) {
        if (!pack?.character) return;
        const characters = {};
        for (const [id, raw] of Object.entries(pack.character)) {
            let info = raw;
            if (extension && Array.isArray(raw)) {
                info = [...raw];
                info[4] = [...(raw[4] || [])];
                if (!info[4].some(tag => typeof tag === 'string' && /^(?:db:extension-.+?|ext|img|character):/.test(tag))) {
                    info[4].push(extension[3] ? `db:extension-${extension[0]}:${id}.jpg` : `ext:${extension[0]}/${id}.jpg`);
                }
            } else if (extension && raw && typeof raw === 'object') {
                info = { ...raw, img: raw.img || `extension/${extension[0]}/${id}.jpg` };
            }
            characters[id] = info;
            if (!(id in library.character)) library.character[id] = info;
        }
        library.characterPack[pack.name] = { ...characters, ...library.characterPack[pack.name] };
        for (const field of fields.filter(field => !['character', 'characterPack'].includes(field))) {
            for (const [id, value] of Object.entries(pack[field] || {})) {
                if (id in library[field]) continue;
                library[field][id] = field === 'skill' && extension && value && ['number', 'boolean'].includes(typeof value.audio)
                    ? { ...value, audio: `ext:${extension[0]}:${Number(value.audio)}` } : value;
            }
        }
        library.translate[pack.name + '_character_config'] ||= pack.translate?.[pack.name] || pack.name;
    }
    for (const pack of Object.values(lib.imported?.character || {})) addPack(pack);
    for (const extension of lib.extensions || []) {
        const data = extension[4];
        if (data?.nopack || !data?.character?.character) continue;
        addPack({ ...data.character, name: extension[0],
            skill: { ...data.character.skill, ...data.skill?.skill },
            translate: { ...data.character.translate, ...data.skill?.translate },
        }, extension);
    }

    const lookup = Object.create(get);
    lookup.character = (id, index) => {
        const raw = library.character[id];
        if (typeof index === 'number') return raw?.[index] ?? (index === 3 || index === 4 ? [] : undefined);
        return get.convertedCharacter?.(raw || { isNull: true }) || raw;
    };
    lookup.translation = (id, ...args) => typeof id === 'string' && library.translate[id] !== undefined
        ? library.translate[id] : get.translation(id, ...args);
    lookup.slimName = id => lib.translate?.[id] ? get.slimName?.(id) || lookup.translation(id) : lookup.translation(id);
    lookup.skillInfoTranslation = (id, ...args) => library.translate[id + '_info'] || get.skillInfoTranslation?.(id, ...args) || '';
    lookup.characterIntro = id => library.characterIntro[id]
        || (library.character[id]?.trashBin || library.character[id]?.[4] || []).find(tag => typeof tag === 'string' && tag.startsWith('des:'))?.slice(4)
        || get.characterIntro?.(id) || '';
    if (get.Audio?.skill) lookup.Audio = {
        skill: options => ({ audioList: get.Audio.skill({ ...options, info: library.skill[options.skill] }).audioList.map(item => ({
            ...item, text: item.text || library.translate['#' + item.name],
        })) }),
    };
    return { ...context, lib: library, get: lookup };
}

export function createStartupCharacterBrowser(context, options = {}) {
    const preview = createStartupCharacterContext(context);
    const doc = options.document || globalThis.document;
    const browser = createCharacterBrowser(preview, {
        pauseGame: false,
        playAudio: createCharacterPreviewAudio(preview, doc),
        ...options,
        setPortrait(element, entry) {
            const id = entry.id;
            const owner = id.startsWith('gz_shibing') ? id.slice(3, 11) : id.startsWith('gz_') ? id.slice(3) : id;
            const saved = preview.lib.config.skin?.[owner];
            let path = Array.isArray(saved) ? saved[1] : typeof saved === 'number' ? `image/skin/${owner}/${saved}.jpg` : entry.info.img;
            if (!path) {
                const tag = (entry.raw.trashBin || entry.raw[4] || []).find(tag => typeof tag === 'string' && /^(?:img|ext|character|db):/.test(tag));
                path = tag?.startsWith('ext:') ? tag.replace(/^ext:/, 'extension/')
                    : tag?.startsWith('img:') ? tag.slice(4)
                    : tag?.startsWith('character:') ? 'image/character/' + tag.slice(10) + '.jpg'
                    : tag || 'image/character/' + id + '.jpg';
            }
            if (path.startsWith('db:')) element.setBackgroundDB(path.slice(3));
            else element.setBackgroundImage(path);
        },
    });
    const open = browser.open;
    browser.open = () => {
        const root = open();
        if (!root) return root;
        let style = root.querySelector('.hh-startup-character-style');
        if (!style) { style = doc.createElement('style'); style.className = 'hh-startup-character-style'; root.appendChild(style); }
        const config = preview.lib.config;
        style.textContent = getPlayerStyleCss(getPlayerStyleSizing(config.extension_HH优化_player_width,
            config.extension_HH优化_newDecadeStyle, config.extension_HH优化_player_height), '.hh-character-browser');
        return root;
    };
    return browser;
}
