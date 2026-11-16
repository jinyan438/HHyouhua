import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { createCharacterCatalog, bindCharacterPress } from '../src/ui/characterCatalog.js';
import { createCharacterBrowser } from '../src/ui/characterBrowser.js';
import { addCharacterCatalogMenu } from '../src/ui/characterBrowserMenu.js';
import { domFixture } from './helpers/catalog-dom.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ connect = false, paused = false, size = 0 } = {}) {
	const dom = domFixture(), calls = { saves: [], pause: 0, resume: 0 };
	const liubei = { sex: 'male', group: 'shu', hp: 4, maxHp: 4, skills: ['rende', 'jijiang'] }, guanyu = ['male', 'shu', 4, ['wusheng']];
	const custom = { sex: 'female', group: 'qun', hp: 3, skills: ['custom_skill'] }, extra = { sex: 'male', group: 'wei', hp: '3/4', skills: [] };
	const _status = { connectMode: connect, paused2: paused };
	const lib = { assetURL: '/noname/', config: { mode: 'identity', identity_banned: ['already_banned'], versus_banned: ['other_mode'] }, onover: [], character: { liubei, guanyu, custom, extra }, characterPack: { standard: { liubei, guanyu, unseen: { isUnseen: true, skills: [] } }, mode_extension_test: { custom, liubei } }, characterIntro: { liubei: '刘备，字玄德。' }, skill: { rende: {}, jijiang: { zhuSkill: true }, wusheng: {}, custom_skill: {} }, translate: { standard_character_config: '标准', mode_extension_test_character_config: '测试扩展', liubei: '刘备', guanyu: '关羽', custom: '自定义武将', extra: '其他武将', rende: '仁德', jijiang: '激将', wusheng: '武圣', rende_info: '可以将手牌交给其他角色。', jijiang_info: '请求蜀势力角色出杀。', custom_skill: '扩展技能', shu: '蜀', wei: '魏', qun: '群', male: '男', female: '女' } };
	for (let i = 0; i < size; i++) { const id = 'test_' + i; lib.character[id] = { ...liubei }; lib.characterPack.standard[id] = lib.character[id]; lib.translate[id] = '测试武将' + i; }
	const game = { async saveConfig(key, value) { calls.saves.push([key, [...value]]); }, pause2() { calls.pause++; _status.paused2 = true; }, resume2() { calls.resume++; _status.paused2 = false; }, system: {}, playAudio() {} };
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
	root.querySelectorAll('.hh-general-tab')[1].emit('click'); assert.equal(root.querySelector('.hh-general-story').textContent, '刘备，字玄德。');
	root.querySelector('.hh-character-back').emit('click');
	const card = root.querySelector('.hh-general-card'); card.emit('pointerdown'); h.advance(600); await flush();
	assert.equal(root.querySelector('.hh-general-card').classList.contains('is-disabled'), true);
	assert.notEqual(root.querySelector('.hh-general-card').disabled, true);
	assert.deepEqual(h.lib.config.identity_banned, ['already_banned', 'liubei']);
	browser.close(); assert.equal(h.calls.resume, 1); assert.equal(h.timers.size, 0); assert.equal(browser.root, null);
	assert.equal(h.document.listeners.get('keydown').length, 0);
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
	assert.equal(sources.files.length, 10);
	for (const file of sources.files) { const bytes = fs.readFileSync(new URL(file.file, base)); assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256); }
});
