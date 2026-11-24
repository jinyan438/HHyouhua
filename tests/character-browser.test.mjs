import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { createCharacterCatalog, bindCharacterPress } from '../src/ui/characterCatalog.js';
import { createCharacterBrowser } from '../src/ui/characterBrowser.js';
import { addCharacterCatalogMenu } from '../src/ui/characterBrowserMenu.js';
import { createSelectionPlayerVisual, captureSelectionPlayerLayout, selectionPlayerSize } from '../src/ui/selectionPlayer.js';
import { domFixture } from './helpers/catalog-dom.mjs';
import { refreshCharacterSettingsMenus } from '../src/ui/characterSettingsMenu.js';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ connect = false, paused = false, size = 0 } = {}) {
	const dom = domFixture(), calls = { saves: [], pause: 0, resume: 0 };
	const liubei = { sex: 'male', group: 'shu', hp: 4, maxHp: 4, skills: ['rende', 'jijiang'] }, guanyu = ['male', 'shu', 4, ['wusheng']];
	const custom = { sex: 'female', group: 'qun', hp: 3, skills: ['custom_skill'] }, extra = { sex: 'male', group: 'wei', hp: '3/4', skills: [] };
	const _status = { connectMode: connect, paused2: paused };
	const lib = { assetURL: '/noname/', config: { mode: 'identity', identity_banned: ['already_banned'], versus_banned: ['other_mode'] }, onover: [], character: { liubei, guanyu, custom, extra }, characterPack: { standard: { liubei, guanyu, unseen: { isUnseen: true, skills: [] } }, mode_extension_test: { custom, liubei } }, characterIntro: { liubei: '刘备，字玄德。' }, skill: { rende: {}, jijiang: { zhuSkill: true }, wusheng: {}, custom_skill: {} }, translate: { standard_character_config: '标准', mode_extension_test_character_config: '测试扩展', liubei: '刘备', guanyu: '关羽', custom: '自定义武将', extra: '其他武将', rende: '仁德', jijiang: '激将', wusheng: '武圣', rende_info: '可以将手牌交给其他角色。', jijiang_info: '请求蜀势力角色出杀。', custom_skill: '扩展技能', shu: '蜀', wei: '魏', qun: '群', male: '男', female: '女' } };
	Object.assign(lib.config, { characters: ['standard'], connect_characters: [], extension_test_characters_enable: true });
	for (let i = 0; i < size; i++) { const id = 'test_' + i; lib.character[id] = { ...liubei }; lib.characterPack.standard[id] = lib.character[id]; lib.translate[id] = '测试武将' + i; }
	const game = { async saveConfig(key, value) { calls.saves.push([key, Array.isArray(value) ? [...value] : value]); }, pause2() { calls.pause++; _status.paused2 = true; }, resume2() { calls.resume++; _status.paused2 = false; }, system: {}, playAudio() {} };
	const get = { character: id => lib.character[id] || Object.values(lib.characterPack).find(pack => pack[id])?.[id], translation: id => lib.translate[id] || id, mode: () => 'identity', characterIntro: id => lib.characterIntro[id] || '', skillInfoTranslation: skill => lib.translate[skill + '_info'] || '' };
	const ui = { window: dom.document.body, click: {}, system1: new dom.Element(), system2: new dom.Element() };
	return { ...dom, context: { lib, game, get, ui, _status }, lib, game, get, calls };
}

test('catalog includes extension packs and legacy characters, hides unseen entries, and deduplicates the all view', () => {
	const h = fixture(), catalog = createCharacterCatalog(h.context);
	assert.equal(catalog.entries.size, 4); assert.deepEqual(catalog.packs.map(pack => pack.name), ['全部', '标准', '测试扩展', '其他武将']);
	assert.equal(catalog.list({ pack: 'mode_extension_test' }).length, 2);
	assert.equal(catalog.list({ query: '刘 备' })[0].id, 'liubei'); assert.equal(catalog.list({ query: 'GUANYU' })[0].id, 'guanyu');
	assert.equal(catalog.list({ query: '仁德' })[0].id, 'liubei'); assert.equal(catalog.entries.get('guanyu').group, 'shu');
});

test('ban changes persist to the native current-mode key, retain other bans and survive catalog reconstruction', async () => {
	const h = fixture(), catalog = createCharacterCatalog(h.context);
	assert.equal(await catalog.toggle('liubei'), true); assert.deepEqual(h.lib.config.identity_banned, ['already_banned', 'liubei']);
	assert.equal(h.lib.config.banned, h.lib.config.identity_banned);
	assert.deepEqual(h.lib.config.versus_banned, ['other_mode']); assert.equal(catalog.list({ status: 'disabled' })[0].id, 'liubei');
	assert.equal(createCharacterCatalog(h.context).isBanned('liubei'), true);
	assert.equal(await catalog.toggle('liubei'), false); assert.deepEqual(h.lib.config.identity_banned, ['already_banned']);
	const online = fixture({ connect: true }); await createCharacterCatalog(online.context).toggle('guanyu');
	assert.deepEqual(online.lib.config.connect_identity_banned, ['guanyu']); assert.deepEqual(online.lib.config.identity_banned, ['already_banned']);
});

test('ban writes serialize concurrent operations and roll back when persistence fails', async () => {
	const h = fixture(), catalog = createCharacterCatalog(h.context), writes = []; let release;
	h.game.saveConfig = (key, value) => { writes.push([...value]); return writes.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(); };
	const first = catalog.toggle('liubei'), duplicate = catalog.toggle('liubei'), second = catalog.toggle('guanyu');
	assert.equal(first, duplicate); await flush(); assert.equal(writes.length, 1); release(); await Promise.all([first, second]);
	assert.deepEqual(writes[1], ['already_banned', 'liubei', 'guanyu']);
	const before = h.lib.config.identity_banned; h.game.saveConfig = async () => { throw new Error('disk failure'); };
	await assert.rejects(catalog.toggle('custom'), /disk failure/); assert.equal(h.lib.config.identity_banned, before);
	assert.equal(h.lib.config.banned, before);
});

test('native promise configuration API completes before the ban operation resolves', async () => {
	const h = fixture(), catalog = createCharacterCatalog(h.context); let release, resolved = false;
	h.game.promises = { saveConfig(key, value) { assert.equal(key, 'identity_banned'); assert.ok(value.includes('liubei')); return new Promise(resolve => { release = resolve; }); } };
	const operation = catalog.toggle('liubei').then(() => { resolved = true; });
	await flush(); assert.equal(resolved, false); assert.equal(h.calls.saves.length, 0);
	release(); await operation; assert.equal(resolved, true);
});

test('long hold toggles once, release does not open details, and scrolling cancels pending holds', () => {
	const h = fixture(), card = h.document.createElement('button'); let opens = 0, toggles = 0;
	const press = bindCharacterPress(card, { ...h.environment, open: () => opens++, toggle: () => toggles++ });
	card.emit('pointerdown'); h.advance(600); h.advance(2400); card.emit('pointerup'); card.emit('click');
	assert.equal(toggles, 1); assert.equal(opens, 0);
	h.advance(1000); card.emit('click'); assert.equal(opens, 1);
	card.emit('pointerdown'); card.emit('pointermove', { clientY: 30 }); h.advance(700); assert.equal(toggles, 1);
	card.emit('pointerdown'); press.cancel(); h.advance(700); assert.equal(toggles, 1);
	press.destroy(); assert.equal(h.timers.size, 0);
});

test('touch fallback and context-menu controls support toggling without unwanted detail clicks', () => {
	const h = fixture(), card = h.document.createElement('button'); let opens = 0, toggles = 0;
	const press = bindCharacterPress(card, { ...h.environment, pointerEvents: false, open: () => opens++, toggle: () => toggles++ });
	card.emit('touchstart', { touches: [{ clientX: 0, clientY: 0 }] }); h.advance(600); card.emit('touchend'); card.emit('click');
	assert.equal(toggles, 1); assert.equal(opens, 0); h.advance(1000); card.emit('contextmenu'); assert.equal(toggles, 2);
	press.destroy();
});

test('full-screen view supports packs, searching, skill detail, ban gray state and owned pause cleanup', async () => {
	const h = fixture(), browser = createCharacterBrowser(h.context, h.environment), root = browser.open();
	assert.equal(browser.open(), root); assert.equal(h.calls.pause, 1);
	assert.equal(root.querySelectorAll('.hh-general-card').length, 4);
	const search = root.querySelector('input'); search.value = '刘备'; search.emit('input');
	assert.equal(root.querySelectorAll('.hh-general-card').length, 1);
	root.querySelector('.hh-general-card').emit('click'); assert.equal(root.querySelector('.hh-character-title').textContent, '武将详情');
	assert.equal(root.querySelector('.hh-general-skill-text').innerHTML, '可以将手牌交给其他角色。');
	root.querySelectorAll('.hh-general-skill')[1].emit('click'); assert.equal(root.querySelector('.hh-general-skill-text').innerHTML, '请求蜀势力角色出杀。');
	root.querySelector('[data-tab="story"]').emit('click'); assert.equal(root.querySelector('.hh-general-story').textContent, '刘备，字玄德。');
	root.querySelector('.hh-character-back').emit('click');
	const card = root.querySelector('.hh-general-card'); card.emit('pointerdown'); h.advance(600); await flush();
	assert.equal(root.querySelector('.hh-general-card').classList.contains('is-disabled'), true);
	assert.notEqual(root.querySelector('.hh-general-card').disabled, true);
	assert.deepEqual(h.lib.config.identity_banned, ['already_banned', 'liubei']);
	browser.close(); assert.equal(h.calls.resume, 1); assert.equal(h.timers.size, 0); assert.equal(browser.root, null);
	assert.equal(h.document.listeners.get('keydown').length, 0);
});

test('the themed dropdown filters package availability and bans together with character search', () => {
	const h = fixture(); h.lib.config.identity_banned = ['guanyu']; h.lib.config.extension_test_characters_enable = false;
	const browser = createCharacterBrowser(h.context, h.environment), root = browser.open();
	const trigger = root.querySelector('.hh-character-filter-button'), menu = root.querySelector('.hh-character-filter-menu');
	const options = root.querySelectorAll('.hh-character-filter-option'), ids = () => root.querySelectorAll('.hh-general-card').map(card => card.dataset.character).sort();
	assert.equal(root.querySelector('select'), null); assert.deepEqual(options.map(option => option.textContent), ['全部武将', '已启用', '已禁用']);
	trigger.emit('click'); assert.equal(menu.hidden, false); options[1].emit('click');
	assert.deepEqual(ids(), ['extra', 'liubei']); assert.equal(trigger.textContent, '已启用'); assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(menu.hidden, true);
	trigger.emit('click'); options[2].emit('click'); assert.deepEqual(ids(), ['custom', 'guanyu']); assert.equal(options[2].getAttribute('aria-selected'), 'true'); assert.equal(options[1].getAttribute('aria-selected'), 'false');
	const search = root.querySelector('input'); search.value = '自定义'; search.emit('input'); assert.deepEqual(ids(), ['custom']);
	trigger.emit('click'); options[1].emit('click'); assert.deepEqual(ids(), []); assert.equal(root.querySelector('.hh-character-empty').hidden, false);
	trigger.emit('click'); options[0].emit('click'); assert.deepEqual(ids(), ['custom']); assert.equal(h.calls.saves.length, 0);
	browser.close();
});

test('dropdown keyboard navigation, outside dismissal and Escape preserve the browser and clean up listeners', () => {
	const h = fixture(), browser = createCharacterBrowser(h.context, h.environment), root = browser.open();
	const trigger = root.querySelector('.hh-character-filter-button'), menu = root.querySelector('.hh-character-filter-menu'), options = root.querySelectorAll('.hh-character-filter-option');
	trigger.emit('keydown', { key: 'ArrowDown' }); assert.equal(menu.hidden, false); assert.equal(h.document.activeElement, options[0]);
	menu.emit('keydown', { key: 'ArrowDown' }); assert.equal(h.document.activeElement, options[1]);
	menu.emit('keydown', { key: 'End' }); assert.equal(h.document.activeElement, options[2]);
	menu.emit('keydown', { key: 'Home' }); assert.equal(h.document.activeElement, options[0]);
	menu.emit('keydown', { key: 'ArrowUp' }); assert.equal(h.document.activeElement, options[2]);
	h.document.emit('keydown', { key: 'Escape' }); assert.equal(menu.hidden, true); assert.equal(browser.root, root); assert.equal(h.document.activeElement, trigger);
	trigger.emit('click'); h.document.emit('pointerdown', { target: options[0] }); assert.equal(menu.hidden, false);
	h.document.emit('pointerdown', { target: root.querySelector('input') }); assert.equal(menu.hidden, true);
	trigger.emit('click'); root.querySelector('.hh-character-scroll').emit('scroll'); assert.equal(menu.hidden, true);
	trigger.emit('click'); h.document.emit('keydown', { key: 'Tab' }); assert.equal(menu.hidden, true); assert.equal(browser.root, root);
	h.document.emit('keydown', { key: 'Escape' }); assert.equal(browser.root, null);
	for (const type of ['keydown', 'pointerdown', 'click']) assert.equal(h.document.listeners.get(type).length, 0);
});

test('detail skills, voice button and skin thumbnails stay in sync and stop preview audio when leaving', async () => {
	const h = fixture(), voiceRequests = [], played = [];
	h.lib.skill.rende.enable = 'phaseUse'; h.lib.skill.jijiang.trigger = { global: 'chooseToUse' };
	h.lib.characterSubstitute = { liubei: [['liubei_alt', ['ext:test/alt.png']]] }; h.lib.translate.liubei_alt = '刘备新装';
	h.get.skinPath = id => 'image/skin/' + id + '/'; h.game.getFileList = (_path, success) => success([], ['favorite.jpg']);
	h.get.Audio = { skill(options) { voiceRequests.push(options); return { audioList: [{ file: 'skill/' + options.skill + '.mp3', text: '仁德台词' }] }; } };
	h.game.playAudio = options => { const audio = { stopped: false, pause() { this.stopped = true; }, remove() {} }; played.push(audio); return audio; };
	const browser = createCharacterBrowser(h.context, h.environment), root = browser.open(); browser.openCharacter('liubei'); await flush();
	assert.equal(root.querySelector('.hh-general-skill-type').getAttribute('aria-label'), '主动');
	assert.equal(root.querySelectorAll('.hh-general-skin').length, 3);
	root.querySelector('[data-skin="character:liubei_alt"]').emit('click'); await flush();
	assert.deepEqual(h.lib.config.skin.liubei, ['liubei_alt', 'extension/test/alt.png']);
	assert.equal(root.querySelector('.hh-general-card-large').querySelector('.primary-avatar').style.backgroundImage, 'extension/test/alt.png');
	root.querySelector('.hh-general-voice').emit('click'); assert.equal(voiceRequests[0].player.skin.name, 'liubei_alt'); assert.equal(root.querySelector('.hh-general-voice-caption').textContent, '仁德台词');
	root.querySelector('[data-skill="jijiang"]').emit('click'); assert.equal(played[0].stopped, true); assert.equal(root.querySelector('.hh-general-skill-type').getAttribute('aria-label'), '被动'); assert.ok(root.querySelector('.hh-general-skill-kind').textContent.includes('主公技'));
	root.querySelector('.hh-general-voice').emit('click'); assert.equal(voiceRequests[1].skill, 'jijiang');
	root.querySelector('.hh-character-back').emit('click'); assert.equal(played[1].stopped, true);
	browser.close();
});

test('large catalogs render incrementally; existing pauses and online games are not resumed by closing', () => {
	const h = fixture({ size: 150 }), browser = createCharacterBrowser(h.context, h.environment); browser.open();
	assert.equal(browser.root.querySelectorAll('.hh-general-card').length, 60);
	browser.root.querySelector('.hh-character-more').emit('click'); assert.equal(browser.root.querySelectorAll('.hh-general-card').length, 120);
	browser.close();
	for (const options of [{ paused: true }, { connect: true }]) { const item = fixture(options), view = createCharacterBrowser(item.context, item.environment); view.open(); view.close(); assert.equal(item.calls.pause, 0); assert.equal(item.calls.resume, 0); }
});

test('all six actual menu themes receive one working catalog button', async () => {
	for (const [skin, creator, method] of [['online', 'Online', 'createMenuButton'], ['shousha', 'Shousha', 'showMenu'], ['xinsha', 'Xinsha', 'createMainMenu'], ['shizhounian', 'Shizhounian', 'createTopRightMenu'], ['baby', 'Baby', 'createTopRightMenu'], ['codename', 'Codename', 'createTopRightMenu']]) {
		const h = fixture(); let opens = 0; h.game.hhCharacterBrowser = { open() { opens++; } };
		h.context.ui.create = { node: tag => h.document.createElement(tag), div(...args) { const node = h.document.createElement('div'); for (const arg of args) { if (typeof arg === 'string' && arg.startsWith('.')) node.className = arg.split('.').filter(Boolean).join(' '); else if (arg?.appendChild) arg.appendChild(node); else if (typeof arg === 'object') Object.assign(node.style, arg); } return node; } };
		const realm = vm.createContext({ ...h.context, document: h.document, window: {}, addCharacterCatalogMenu, queueMicrotask, initChatSystem() {}, console });
		for (const name of ['base', skin]) { const text = fs.readFileSync(new URL('../ui/lbtn/skins/' + name + '.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''); vm.runInContext(text, realm); }
		const plugin = realm['create' + creator + 'LbtnPlugin'](h.lib, h.game, h.context.ui, h.get, {}, h.context._status, {});
		plugin[method]();
		if (skin === 'online') h.context.ui.caidanbutton.onclick();
		else if (method === 'createTopRightMenu') h.document.body.querySelectorAll('img').at(-1).onclick();
		await flush();
		const button = h.document.body.querySelector('.hh-character-menu-button'); assert.ok(button, skin);
		assert.equal(h.document.body.querySelectorAll('.hh-character-menu-button').length, 1, skin);
		button.emit('click'); await flush(); assert.equal(opens, 1, skin);
	}
});

test('all native catalog UI resources retain their source hashes', () => {
	const base = new URL('../assets/character-browser/', import.meta.url), sources = JSON.parse(fs.readFileSync(new URL('sources.json', base), 'utf8'));
	assert.equal(sources.files.length, 19);
	for (const file of sources.files) { const bytes = fs.readFileSync(new URL(file.file, base)); assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256); }
});

test('selection visuals preserve the live template and use its faction renderer without player initialization', () => {
	const h = fixture(), template = h.document.createElement('div'); template.className = 'player'; template.dataset.borderLevel = 'four';
	const avatar = h.document.createElement('div'); avatar.className = 'primary-avatar hidden'; avatar.setBackground('old');
	const camp = h.document.createElement('div'); camp.className = 'camp-wrap'; camp.dataset.camp = 'old';
	for (const cls of ['camp-back','camp-border','camp-name','avatar-name','custom-camp-decoration']) { const part = h.document.createElement('div'); part.className = cls; part.textContent = '原武将'; camp.appendChild(part); }
	// Country-war templates are still unrevealed when the selection screen opens.
	camp.querySelector('.avatar-name').classList.add('hidden');
	const hpWrap = h.document.createElement('div'); hpWrap.className = 'hp-wrap'; hpWrap.appendChild(h.document.createElement('div'));
	template.node = { avatar, campWrap: camp, hpWrap }; template.append(avatar,camp,hpWrap); template.init = () => assert.fail('visual must not initialize players');
	h.game.players = [template]; h.lib.config.extension_HH优化_borderLevel = 'random'; h.lib.character.liubei.hp = 3;
	h.get.slimName = () => '<b>界</b>刘备'; let groupCalls = 0;
	const prototype = {}; Object.defineProperty(prototype, 'group', { set(group) { groupCalls++; assert.notEqual(this,template); this.node.campWrap.node.campName.textContent = '渲染：'+group; } });
	h.lib.element = { Player: { prototype } };
	const visual = createSelectionPlayerVisual(h.context,'liubei',h.environment);
	assert.equal(visual.dataset.borderLevel,'four'); assert.equal(visual.querySelector('.primary-avatar').portraitId,'liubei');
	assert.equal(visual.querySelector('.avatar-name').innerHTML,'<b>界</b>刘备'); assert.equal(visual.querySelector('.camp-name').textContent,'渲染：shu');
	assert.equal(visual.querySelector('.avatar-name').classList.contains('hidden'),false);
	assert.ok(visual.querySelector('.custom-camp-decoration')); assert.equal(visual.querySelector('.hp').children.length,4); assert.equal(visual.querySelectorAll('.lost').length,1);
	assert.equal(visual.querySelectorAll('.hh-general-swap').length,0); assert.equal(groupCalls,1);
	assert.equal(avatar.portraitId,'old'); assert.equal(avatar.classList.contains('hidden'),true); assert.equal(camp.dataset.camp,'old'); assert.equal(hpWrap.children.length,1);
	assert.equal(camp.querySelector('.avatar-name').classList.contains('hidden'),true);
});

test('selection visuals handle large and string health values with the same compact counter', () => {
	const h = fixture(); h.lib.character.extra.hp = '5/8'; h.get.numStr = String;
	const visual = createSelectionPlayerVisual(h.context,'extra',h.environment);
	assert.equal(visual.querySelector('.hp').innerHTML,'5<br>/<br>8<div></div>'); assert.equal(visual.querySelector('.hp').dataset.condition,'high');
	assert.equal(visual.dataset.maxHp,'4'); assert.equal(visual.querySelector('.hp').classList.contains('textstyle'),true);
});

test('selection health allows shared width styles to update without frozen inline coordinates', () => {
	const h = fixture(), template = h.document.createElement('div'), hpWrap = h.document.createElement('div');
	template.offsetWidth = 136; template.offsetHeight = 180; hpWrap.offsetLeft = -72; hpWrap.className = 'hp-wrap';
	h.lib.config.extension_HH优化_player_width = '136';
	template.node = { campWrap: h.document.createElement('div'), hpWrap }; template.appendChild(hpWrap); h.game.players = [template];
	const visual = createSelectionPlayerVisual(h.context, 'liubei', h.environment), health = visual.querySelector('.hp-wrap');
	assert.equal(health.style.left, undefined); assert.equal(health.style.right, undefined);
	// The live right-anchored wrapper moves when its player widens; the selection copy must not.
	for (const [width, scale] of [[136, 1], [160, .8], [120, 1.6], [136, .5]]) {
		template.offsetWidth = width; hpWrap.offsetLeft = width - 208;
		visual.style.setProperty('--hh-player-width', `${width}px`); visual.style.setProperty('--hh-player-scale', scale);
		assert.equal(health.style.left, undefined); assert.equal(health.style.right, undefined);
		const rerolled = createSelectionPlayerVisual(h.context, 'guanyu', h.environment);
		assert.equal(rerolled.querySelector('.hp-wrap').style.left, undefined, 'New cards must follow the same live styles');
	}
	assert.equal(hpWrap.style.left, undefined); assert.equal(hpWrap.style.right, undefined);
	assert.equal(health.querySelector('.hp').children.length, 4);
});

test('catalog visuals follow player dimensions after resizing and release the resize observer on close', () => {
	const h = fixture(), template = h.document.createElement('div'); template.offsetWidth = 140; template.offsetHeight = 190;
	template.node = { campWrap: h.document.createElement('div') }; h.game.players = [template]; let callback, disconnected = 0;
	h.environment.window.ResizeObserver = class { constructor(fn) { callback=fn; } observe() {} disconnect() { disconnected++; } };
	const browser = createCharacterBrowser(h.context,h.environment); const root = browser.open();
	assert.equal(root.style['--hh-card-aspect'],'140/190'); const card = root.querySelector('.hh-general-card'); card.clientWidth = 210; callback();
	assert.equal(card.style['--hh-player-scale'],'1.5'); assert.ok(card.querySelector('.hh-selection-player'));
	template.offsetWidth=150;template.offsetHeight=200;callback();assert.equal(root.style['--hh-card-aspect'],'150/200');assert.equal(card.style['--hh-player-scale'],'1.4');
	browser.close();assert.equal(disconnected,1);assert.equal(h.game.players[0],template);
});

test('catalog retains exact card dimensions and scale recorded by opening selection', () => {
	const h=fixture(),template=h.document.createElement('div');template.offsetWidth=136;template.offsetHeight=180;
	template.getBoundingClientRect=()=>({width:204,height:270});
	const opening=captureSelectionPlayerLayout(template,.5);h.game.hhSelectionCardLayout=opening;
	assert.deepEqual(opening,{width:408,height:540,playerWidth:136,playerHeight:180,playerScale:3});
	template.offsetWidth=150;template.offsetHeight=210;
	assert.equal(selectionPlayerSize(template,h.game,h.lib),opening);
	let relayout;h.environment.window.ResizeObserver=class { constructor(fn){relayout=fn;} observe(){} unobserve(){} disconnect(){} };
	const browser=createCharacterBrowser(h.context,h.environment),root=browser.open();const card=root.querySelector('.hh-general-card');
	card.clientWidth=204;relayout();
	assert.equal(root.style['--hh-card-aspect'],'408/540');assert.equal(root.style['--hh-player-width'],'136px');
	assert.equal(card.style['--hh-player-scale'],'1.5');
	browser.close();
});

test('detail fills the measured left region at the opening ratio and corrects additional visual scaling', () => {
	const h = fixture(), template = h.document.createElement('div'); template.offsetWidth = 136; template.offsetHeight = 180;
	template.node = { campWrap: h.document.createElement('div') }; h.game.players = [template];
	h.game.hhSelectionCardLayout = { width: 272, height: 360, playerWidth: 136, playerHeight: 180, playerScale: 2 };
	let resize, stacked = false; const unobserved = [];
	h.environment.window.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} unobserve(node) { unobserved.push(node); } disconnect() {} };
	h.environment.window.getComputedStyle = element => element.classList.contains('hh-general-detail') ? { display: stacked ? 'flex' : 'grid' } : { paddingTop: '40px', paddingBottom: '0px', paddingLeft: '0px', paddingRight: '0px' };
	const browser = createCharacterBrowser(h.context, h.environment), root = browser.open(); browser.openCharacter('liubei');
	const card = root.querySelector('.hh-general-card-large'), left = card.parentNode, visual = card.querySelector('.hh-selection-player'), zoom = .7;
	left.clientWidth = 760; left.clientHeight = 1000;
	Object.defineProperty(card, 'clientWidth', { get: () => parseFloat(card.style.width) || 0 });
	card.getBoundingClientRect = () => ({ width: parseFloat(card.style.width) * zoom, height: parseFloat(card.style.height) * zoom });
	visual.getBoundingClientRect = () => ({ width: 136 * Number(card.style['--hh-player-scale']) * zoom * .55 });
	resize(); assert.equal(parseFloat(card.style.height), 960); assert.ok(Math.abs(parseFloat(card.style.width) / parseFloat(card.style.height) - 136 / 180) < 1e-9);
	assert.ok(Math.abs(visual.getBoundingClientRect().width - card.getBoundingClientRect().width) < .01);
	left.clientWidth = 1000; left.clientHeight = 1200; resize(); assert.equal(parseFloat(card.style.height), 1160);
	assert.ok(Math.abs(visual.getBoundingClientRect().width - card.getBoundingClientRect().width) < .01);
	stacked = true; resize(); assert.equal(card.style.width, ''); assert.equal(card.style.height, '');
	root.querySelector('.hh-character-back').emit('click'); assert.ok(unobserved.includes(left)); browser.close();
});

test('pack state uses the native allowlist and keeps individual bans when whole packs change', async () => {
	const h=fixture();h.lib.characterPack.hh_sp={custom:h.lib.character.custom};h.lib.translate.hh_sp_character_config='HH分包';
	const catalog=createCharacterCatalog(h.context),before=[...h.lib.config.identity_banned],characters=h.lib.character;
	assert.equal(catalog.isPackEnabled('hh_sp'),false);assert.equal(catalog.isCharacterPackEnabled('custom','hh_sp'),false);
	assert.equal(await catalog.togglePack('hh_sp'),true);assert.deepEqual(h.lib.config.characters,['standard','hh_sp']);
	assert.equal(await catalog.togglePack('standard'),false);assert.equal(catalog.counts('standard').enabled,0);
	assert.equal(catalog.list({pack:'standard',status:'enabled'}).length,0);assert.equal(catalog.list({pack:'standard',status:'disabled'}).length,2);
	assert.equal(catalog.isCharacterPackEnabled('liubei'),true);assert.equal(catalog.isCharacterPackEnabled('liubei','standard'),false);
	assert.deepEqual(h.lib.config.identity_banned,before);assert.equal(h.lib.character,characters);
	await assert.rejects(catalog.togglePack('__all'));await assert.rejects(catalog.togglePack('__other'));
	assert.equal(createCharacterCatalog(h.context).isPackEnabled('hh_sp'),true);
});

test('online pack exclusions and legacy extension character switches retain the native meaning', async () => {
	const h=fixture({connect:true});h.lib.config.connect_characters=['standard'];h.lib.config.extension_test_enable=true;
	const catalog=createCharacterCatalog(h.context);assert.equal(catalog.isPackEnabled('standard'),false);
	assert.equal(await catalog.togglePack('standard'),true);assert.deepEqual(h.lib.config.connect_characters,[]);
	assert.equal(await catalog.togglePack('standard'),false);assert.deepEqual(h.lib.config.connect_characters,['standard']);assert.deepEqual(h.lib.config.characters,['standard']);
	assert.equal(await catalog.togglePack('mode_extension_test'),false);assert.equal(h.lib.config.extension_test_characters_enable,false);assert.equal(h.lib.config.extension_test_enable,true);
	assert.equal(await catalog.togglePack('mode_extension_test'),true);assert.deepEqual(h.lib.config.identity_banned,['already_banned']);
	h.game.hasExtensionLoaded=()=>false;assert.equal(catalog.canTogglePack('mode_extension_test'),false);assert.equal(catalog.isPackEnabled('mode_extension_test'),false);
});

test('pack and group writes serialize with bans, suppress repeated holds and restore failed writes', async () => {
	const h=fixture();h.lib.characterSort={standard:{first:['liubei']}};let release;const writes=[];
	h.game.saveConfig=(key,value)=>{writes.push(key);return writes.length===1?new Promise(resolve=>{release=resolve}):Promise.resolve()};
	const catalog=createCharacterCatalog(h.context),first=catalog.togglePack('standard');assert.equal(catalog.togglePack('standard'),first);
	const ban=catalog.toggle('guanyu'),group=catalog.toggleGroup('standard','first');await flush();assert.equal(writes.length,1);release();await Promise.all([first,ban,group]);
	assert.deepEqual(h.lib.config.identity_banned,['already_banned','guanyu','liubei']);assert.deepEqual(writes,['characters','identity_banned','identity_banned']);
	const before=h.lib.config.characters,bans=h.lib.config.identity_banned,flag=h.lib.config.extension_test_characters_enable;
	h.game.saveConfig=async()=>{throw new Error('disk failure')};
	await assert.rejects(catalog.togglePack('standard'),/disk failure/);assert.equal(h.lib.config.characters,before);
	await assert.rejects(catalog.togglePack('mode_extension_test'),/disk failure/);assert.equal(h.lib.config.extension_test_characters_enable,flag);
	await assert.rejects(catalog.toggleGroup('standard','first'),/disk failure/);assert.equal(h.lib.config.identity_banned,bans);assert.equal(h.lib.config.banned,bans);
});

test('subpacks follow characterSort names, order and the current-mode bulk ban settings', async () => {
	const h=fixture();h.lib.characterSort={standard:{first:['liubei'],second:['guanyu']}};Object.assign(h.lib.translate,{first:'第一分包',second:'第二分包'});
	const catalog=createCharacterCatalog(h.context);assert.deepEqual(catalog.sections({pack:'standard'}).map(section=>section.name),['第一分包','第二分包']);
	assert.equal(catalog.sections({pack:'standard',query:'刘备'})[0].group,'first');
	assert.equal(await catalog.toggleGroup('standard','first'),false);assert.ok(h.lib.config.identity_banned.includes('liubei'));assert.equal(catalog.groupEnabled('standard','first'),false);
	await catalog.toggle('guanyu');await catalog.togglePack('standard');
	assert.equal(await catalog.toggleGroup('standard','first'),true);assert.equal(catalog.isBanned('liubei'),false);assert.equal(catalog.isBanned('guanyu'),true);assert.equal(catalog.counts('standard').enabled,0);
	await catalog.togglePack('standard');assert.equal(catalog.counts('standard').enabled,1);assert.deepEqual(h.lib.config.versus_banned,['other_mode']);
	const online=fixture({connect:true});online.lib.characterSort=h.lib.characterSort;await createCharacterCatalog(online.context).toggleGroup('standard','first');assert.deepEqual(online.lib.config.connect_identity_banned,['liubei']);
});

test('sidebar holds toggle packages without selecting them, scrolling cancels holds and sections toggle groups', async () => {
	const h=fixture();h.lib.characterSort={standard:{first:['liubei','guanyu']}};h.lib.translate.first='蜀汉分包';
	const view=createCharacterBrowser(h.context,h.environment),root=view.open();const standard=root.querySelector('[data-pack="standard"]'),legacy=root.querySelector('[data-pack="mode_extension_test"]');
	legacy.emit('click');assert.equal(legacy.getAttribute('aria-pressed'),'true');standard.emit('pointerdown');h.advance(600);await flush();standard.emit('pointerup');standard.emit('click');
	assert.equal(standard.classList.contains('is-pack-disabled'),true);assert.equal(legacy.getAttribute('aria-pressed'),'true');assert.equal(h.lib.config.characters.includes('standard'),false);
	h.advance(1000);standard.emit('click');assert.equal(root.querySelector('.hh-character-section-name').textContent,'蜀汉分包');
	assert.ok(root.querySelectorAll('.hh-general-card').every(card=>card.classList.contains('is-pack-disabled')));
	root.querySelector('.hh-character-section-toggle').emit('click');await flush();assert.ok(root.querySelectorAll('.hh-general-card').every(card=>card.classList.contains('is-disabled')));
	root.querySelector('.hh-character-section-toggle').emit('click');await flush();assert.equal(h.lib.config.identity_banned.includes('liubei'),false);assert.equal(h.lib.config.characters.includes('standard'),false);
	standard.emit('pointerdown');root.querySelector('.hh-character-packs').emit('scroll');h.advance(700);await flush();assert.equal(h.lib.config.characters.includes('standard'),false);
	view.close();assert.equal(h.timers.size,0);
	h.lib.config.characters.push('standard');h.lib.config.identity_banned.push('guanyu');const reopened=view.open();assert.equal(reopened.querySelector('[data-pack="standard"]').classList.contains('is-pack-disabled'),false);assert.equal(reopened.querySelector('[data-character="guanyu"]').classList.contains('is-disabled'),true);view.close();
});

test('existing native character settings pages refresh pack, subgroup and individual ban controls only', async () => {
	const h=fixture();h.lib.characterSort={standard:{first:['liubei']}};const catalog=createCharacterCatalog(h.context),make=(cls='')=>{const node=h.document.createElement('div');node.className=cls;return node};
	const menu=make(),tabs=make('menu-tab'),start=make(),page=make(),left=make(),pack=make('menubutton'),packPage=make();page.appendChild(left);left.appendChild(pack);pack.mode='standard';pack.link=packPage;
	const begin=make();begin.textContent='开始';begin._link=start;const chars=make();chars.textContent='武将';chars._link=page;tabs.append(begin,chars);menu.appendChild(tabs);h.context.ui.menuContainer=menu;
	const switchRow=make('config on');switchRow._link={config:{name:'开启',_name:'standard',init:true}};const groupRow=make('config on');groupRow._link={config:{name:'第一分包',_name:'first',init:true}};const aiRow=make('config on');aiRow._link={config:{name:'仅点将可用',init:true}};
	const card=make('character');card.updateBanned=()=>card.classList.toggle('banned',h.lib.config.identity_banned.includes('liubei'));packPage.append(switchRow,groupRow,aiRow,card);
	await catalog.togglePack('standard');await catalog.toggleGroup('standard','first');refreshCharacterSettingsMenus(h.context,catalog);
	assert.equal(pack.classList.contains('off'),true);assert.equal(switchRow.classList.contains('on'),false);assert.equal(switchRow._link.config.init,false);assert.equal(groupRow.classList.contains('on'),false);assert.equal(card.classList.contains('banned'),true);assert.equal(aiRow.classList.contains('on'),true);
});

const nativeMenuFile='F:/noname/apps/core/noname/ui/create/menu/pages/characterPackMenu.js';
test('native settings handlers and the catalog read and write the same package and subgroup data', {skip:!fs.existsSync(nativeMenuFile)}, async () => {
	const h=fixture();h.lib.characterSort={standard:{first:['liubei']}};
	const text=fs.readFileSync(nativeMenuFile,'utf8'),start=text.indexOf('var togglePack = function (bool) {'),end=text.indexOf('\n\tvar createModeConfig',start);
	assert.ok(start>=0&&end>start);const packCode=text.slice(start+'var togglePack = '.length,end).trim().replace(/;$/,'');
	const groupStart=text.indexOf('onclick(bool) {',text.indexOf('var cfgnodeY = {')),bodyStart=groupStart+'onclick(bool) {'.length,bodyEnd=text.indexOf('updateActive();',bodyStart)+'updateActive();'.length;
	assert.ok(groupStart>=0&&bodyEnd>bodyStart);
	const wire=values=>{Object.defineProperties(values,{add:{configurable:true,value(id){if(!this.includes(id))this.push(id)}},remove:{configurable:true,value(id){let at;while((at=this.indexOf(id))>=0)this.splice(at,1)}}});return values};
	const game={saveConfig(key,value){h.lib.config[key]=value},hasExtension:()=>true,hasExtensionLoaded:()=>true,saveExtensionConfig(name,key,value){h.lib.config[`extension_${name}_${key}`]=value}};
	const realm=vm.createContext({lib:h.lib,game,get:h.get,_status:h.context._status,connectMenu:false,mode:'standard',updateNodes(){},updateActive(){}});
	const nativePack=vm.runInContext('('+packCode+')',realm),nativeGroup=vm.runInContext('(function(bool){'+text.slice(bodyStart,bodyEnd)+'})',realm),catalog=createCharacterCatalog({...h.context,game});
	wire(h.lib.config.characters);nativePack.call({_link:{config:{_name:'standard'}}},false);assert.equal(catalog.isPackEnabled('standard'),false);
	await catalog.togglePack('standard');assert.equal(h.lib.config.characters.includes('standard'),true);
	wire(h.lib.config.identity_banned);nativeGroup.call({_link:{config:{_name:'first'}}},false);assert.equal(catalog.isBanned('liubei'),true);
	await catalog.toggleGroup('standard','first');assert.equal(h.lib.config.identity_banned.includes('liubei'),false);
	nativePack.call({_link:{config:{_name:'mode_extension_test'}}},false);assert.equal(catalog.isPackEnabled('mode_extension_test'),false);await catalog.togglePack('mode_extension_test');assert.equal(h.lib.config.extension_test_characters_enable,true);
});
