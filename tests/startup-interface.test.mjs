import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createStartupInterface } from '../src/ui/startup.js';
import { migrateStartupPreferences, loadStartupMedia, startupVideos, startupMusic, disposeStartupBackground, defaultStartupMusic, startupMusicFile } from '../src/ui/startupMedia.js';
import { domFixture } from './helpers/catalog-dom.mjs';

test('大厅按钮和模式卡面来自原始图集，截图回退明确限制在头像及两张横幅', async () => {
    const base = new URL('../assets/startup/lobby/', import.meta.url);
    const sources = JSON.parse(await readFile(new URL('sources.json', base), 'utf8'));
    assert.deepEqual(Object.keys(sources).filter(name => sources[name].kind === 'reference-fallback'), ['avatar.webp', 'promotion.webp', 'nostalgia.webp']);
    for (const name of ['mode-landlord', 'mode-rank', 'mode-classic', 'mode-activity', 'footer-general', 'footer-skin', 'footer-officer', 'footer-recruit', 'footer-bag', 'gift', 'welfare', 'anniversary', 'rank-crest']) {
        assert.equal(sources[name + '.webp'].kind, 'native-atlas', name);
        assert.ok(sources[name + '.webp'].atlas, name);
    }
    for (const [name, source] of Object.entries(sources)) {
        assert.equal(createHash('sha256').update(await readFile(new URL(name, base))).digest('hex'), source.sha256, name);
    }
});

function preferences(config = {}) {
	const writes = [];
	const game = { promises: { async saveConfig(key, value) { config[key] = value; writes.push(key); } } };
	return { lib: { config }, game, writes };
}

test('合并时改用孙尚香并保留音乐、视频比例及模式布局，后续用户设置不被覆盖', async () => {
	const h = preferences({ extensions: ['十周年UI', '启动界面美化', 'HH优化', '其它'], extension_启动界面美化_enable: true,
		extension_启动界面美化_backgroundMusicChoose: 'Hue', backgroundVideoChoose: '忧', videoDisplayMode: 'fill',
		mhjm_modes: ['guozhan', 'identity'], wlmh_willTurnVideos: ['忧.mp4'], show_splash: 'off' });
	await migrateStartupPreferences(h.lib, h.game);
	assert.equal(h.lib.config.extension_HH优化_backgroundVideoChoose, '孙尚香');
	assert.equal(h.lib.config.extension_HH优化_backgroundMusicChoose, 'Hue');
	assert.equal(h.lib.config.extension_HH优化_videoDisplayMode, 'fill');
	assert.equal(h.lib.config.extension_启动界面美化_enable, false);
	assert.deepEqual(h.lib.config.extensions, ['十周年UI', 'HH优化', '其它']);
	assert.deepEqual(h.lib.config.mhjm_modes, ['guozhan', 'identity']);
	assert.deepEqual(h.lib.config.wlmh_willTurnVideos, ['忧.mp4']);
	assert.equal(h.lib.config.show_splash, 'init');
	h.lib.config.extension_HH优化_backgroundVideoChoose = '伊吹';
	h.lib.config.extension_HH优化_startupInterface = false;
	h.lib.config.show_splash = 'off';
	const count = h.writes.length;
	await migrateStartupPreferences(h.lib, h.game);
	assert.equal(h.writes.length, count);
	assert.equal(h.lib.config.extension_HH优化_backgroundVideoChoose, '伊吹');
	assert.equal(h.lib.config.extension_HH优化_startupInterface, false);
	assert.equal(h.lib.config.show_splash, 'off');
});

test('网页无文件系统时仍能选择全部内置媒体，含开场动画标记', async () => {
	const config = { backgroundVideoChoose: {}, backgroundMusicChoose: {} }, lib = {};
	await loadStartupMedia(lib, {}, config);
	assert.equal(Object.keys(config.backgroundVideoChoose.item).length, 6);
	assert.equal(config.backgroundVideoChoose.item.忧, '忧(含开场动画)');
	assert.equal(config.backgroundVideoChoose.item.孙尚香, '孙尚香');
	assert.equal(Object.keys(config.backgroundMusicChoose.item).length, 8);
	assert.equal(config.backgroundMusicChoose.item[defaultStartupMusic], '原版大厅');
	assert.equal(startupMusicFile(lib), '原版大厅.m4a');
	assert.equal(startupMusicFile(lib, 'Aira'), 'Aira.mp3');
	for (const [folder, names] of [['video', startupVideos], ['music', startupMusic]]) {
		for (const name of names) {
			const data = await readFile(new URL('../assets/startup/' + folder + '/' + name, import.meta.url));
			assert.ok(data.length > 0, name);
			if (name === '孙尚香.mp4') assert.ok(data.length <= 6 * 1024 * 1024, '默认视频不能重新带入导致旧安卓更新器内存峰值过高的 54 MiB 原文件');
		}
	}
});

test('扫描合并目录中的自定义媒体，去重并忽略其它文件', async () => {
	const config = { backgroundVideoChoose: {}, backgroundMusicChoose: {} }, lib = {}, paths = [];
	await loadStartupMedia(lib, { getFileList(path, done) { paths.push(path); done([], path.endsWith('video') ? ['孙尚香.mp4', '自定义.mp4', '开场-自定义.mp4', 'README.txt'] : ['自定义.mp3', '自定义AAC.m4a', 'sources.json']); } }, config);
	assert.deepEqual(paths, ['extension/HH优化/assets/startup/video', 'extension/HH优化/assets/startup/music']);
	assert.equal(config.backgroundVideoChoose.item.自定义, '自定义(含开场动画)');
	assert.equal(config.backgroundMusicChoose.item.自定义, '自定义');
	assert.equal(config.backgroundMusicChoose.item.自定义AAC, '自定义AAC');
	assert.equal(startupMusicFile(lib, '自定义AAC'), '自定义AAC.m4a');
	assert.equal(config.backgroundMusicChoose.item.sources, undefined);
	assert.equal(lib.allBackgroundVideos.filter(name => name === '孙尚香.mp4').length, 1);
});

test('原版大厅成为新默认，旧 Aira 默认只迁移一次，之后尊重主动选择', async () => {
	const fresh = preferences();
	await migrateStartupPreferences(fresh.lib, fresh.game);
	assert.equal(fresh.lib.config.extension_HH优化_backgroundMusicChoose, defaultStartupMusic);
	const upgraded = preferences({ extension_HH优化_startupMergedVersion: 1, extension_HH优化_backgroundMusicChoose: 'Aira' });
	await migrateStartupPreferences(upgraded.lib, upgraded.game);
	assert.equal(upgraded.lib.config.extension_HH优化_backgroundMusicChoose, defaultStartupMusic);
	assert.equal(upgraded.lib.config.extension_HH优化_startupMusicDefaultVersion, 1);
	upgraded.lib.config.extension_HH优化_backgroundMusicChoose = 'Aira';
	const count = upgraded.writes.length;
	await migrateStartupPreferences(upgraded.lib, upgraded.game);
	assert.equal(upgraded.lib.config.extension_HH优化_backgroundMusicChoose, 'Aira');
	assert.equal(upgraded.writes.length, count);
	const legacy = preferences({ extension_启动界面美化_backgroundMusicChoose: 'Aira' });
	await migrateStartupPreferences(legacy.lib, legacy.game);
	assert.equal(legacy.lib.config.extension_HH优化_backgroundMusicChoose, defaultStartupMusic);
});

async function interfaceFixture(t, enabled = true) {
	const dom = domFixture(), original = {};
	for (const key of ['document', 'window', 'setInterval', 'clearInterval']) original[key] = globalThis[key];
	globalThis.document = dom.document;
	globalThis.window = { addEventListener() {}, removeEventListener() {} };
	globalThis.setInterval = () => 1;
	globalThis.clearInterval = () => {};
	t.after(() => { for (const [key, value] of Object.entries(original)) globalThis[key] = value; });
	const h = preferences({ extension_HH优化_startupInterface: enabled, hiddenModePack: [], volumn_background: 4, volumn_audio: 4 });
	h.game.saveConfig = (key, value) => { h.lib.config[key] = value; };
	h.lib.assetURL = '/'; h.lib.init = { css() {} };
	h.lib.mode = Object.fromEntries(['identity', 'guozhan', 'versus', 'connect', 'doudizhu', 'brawl'].map(mode => [mode, { name: mode }]));
	const ui = { background: new dom.Element(), arena: { hide() {}, show() {} }, create: { div(selector, parent) {
		const node = new dom.Element();
		if (typeof selector === 'string') node.className = selector.replaceAll('.', ' ').trim(); else Object.assign(node.style, selector);
		parent?.appendChild(node); return node;
	} } };
	dom.document.body.appendChild(ui.background);
	const createElement = dom.document.createElement;
	dom.document.createElement = tag => Object.assign(createElement(tag), { play: () => Promise.reject(Error('autoplay blocked')), pause() { this.paused = true; } });
	const startup = createStartupInterface(h.lib, h.game, ui, {}, {}, {});
	await startup.precontent();
	return { ...h, ...dom, ui, startup };
}

test('默认视频被阻止或解码失败时仍显示模式，预览切换和进入游戏会清理媒体监听', async t => {
	const h = await interfaceFixture(t);
	window.inSplash = true;
	let background = h.ui.beautifyStartInterface_background;
	assert.equal(background.video.src, '/extension/HH优化/assets/startup/video/孙尚香.mp4');
	assert.equal(background.music.src, '/extension/HH优化/assets/startup/music/原版大厅.m4a');
	assert.equal(h.startup.config.backgroundMusicChoose.init, defaultStartupMusic);
	h.startup.config.backgroundMusicChoose.onclick('Hue');
	assert.equal(background.music.src, '/extension/HH优化/assets/startup/music/Hue.mp3');
	h.startup.config.backgroundMusicChoose.onclick(defaultStartupMusic);
	assert.equal(background.music.src, '/extension/HH优化/assets/startup/music/原版大厅.m4a');
	assert.equal(background.video.muted, true);
	assert.equal(background.video.playsInline, true);
	assert.ok(background.module1.isConnected, '无需等待视频 loadeddata 即可选模式');
	background.video.emit('error');
	assert.ok(background.module1.isConnected);
	await Promise.resolve(); await Promise.resolve();
	assert.ok(h.document.listeners.get('click').length);
	h.startup.config.backgroundVideoChoose.onclick('伊吹');
	background = h.ui.beautifyStartInterface_background;
	assert.equal(background.video.videoName, '伊吹.mp4');
	assert.equal(background.parentNode, h.document.body, '启动页中切视频保持启动状态');
	h.startup.content();
	await Promise.resolve(); await Promise.resolve();
	assert.equal(h.ui.beautifyStartInterface_background, undefined);
	assert.equal(h.ui.qdmh_background, undefined);
	for (const type of ['visibilitychange', 'click', 'touchstart']) assert.equal(h.document.listeners.get(type)?.length ?? 0, 0, type);
});

test('禁用时沿用原启动页，仍可从 HH 设置预览并关闭', async t => {
	const h = await interfaceFixture(t, false);
	assert.equal(Object.getOwnPropertyDescriptor(window, 'inSplash'), undefined);
	assert.equal(h.ui.qdmh_background, undefined);
	h.startup.config.previewEffect.onclick('style1');
	assert.ok(h.ui.beautifyStartInterface_background);
	h.startup.config.previewEffect.onclick('none');
	assert.equal(h.ui.beautifyStartInterface_background, undefined);
	disposeStartupBackground(h.ui);
});

test('大厅仅接入四个指定入口，保存模式后才清理视频并重启', async t => {
	const h = await interfaceFixture(t);
	let reloads = 0;
	h.game.reload = () => reloads++;
	for (const [label, mode] of [['斗地主', 'doudizhu'], ['排位赛', 'versus'], ['经典场', 'identity'], ['活动场', 'guozhan']]) {
		window.inSplash = true;
		const background = h.ui.beautifyStartInterface_background;
        const buttons = background.lobby.querySelectorAll('.hh-lobby-mode');
		assert.equal(buttons.length, 4);
		assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')), ['斗地主', '排位赛', '经典场', '活动场']);
		const entry = buttons.find(button => button.getAttribute('aria-label') === label);
		assert.equal(entry.dataset.mode, mode);
		let finish;
		h.game.promises.saveConfig = (key, value) => new Promise(resolve => { finish = () => { h.lib.config[key] = value; resolve(); }; });
		const before = reloads;
		const selecting = entry.onclick();
		await entry.onclick();
		assert.equal(reloads, before, '存储完成前不能重启，重复点击不能多次提交');
		assert.ok(background.isConnected);
		finish(); await selecting;
		assert.equal(h.lib.config.mode, mode);
		assert.equal(reloads, before + 1);
		assert.equal(h.ui.beautifyStartInterface_background, undefined);
		assert.equal(background.video.paused, true);
		assert.equal(h.document.body.classList.contains('hh-startup-active'), false);
	}
});

test('大厅模式保存失败时可重试，入口与视频保持可用', async t => {
	const h = await interfaceFixture(t);
	window.inSplash = true;
	const background = h.ui.beautifyStartInterface_background;
	const button = background.module1;
	let reloads = 0;
	h.game.reload = () => reloads++;
	h.game.promises.saveConfig = async () => { throw Error('storage unavailable'); };
	const error = console.error;
	console.error = () => {};
	try { await button.onclick(); } finally { console.error = error; }
	assert.equal(reloads, 0);
	assert.ok(background.isConnected);
	assert.equal(background.lobby.classList.contains('hh-lobby-entering'), false);
	h.game.promises.saveConfig = async (key, value) => { h.lib.config[key] = value; };
	await button.onclick();
	assert.equal(reloads, 1);
});

test('大厅武将入口复用浏览界面，关闭返回大厅并随大厅一起清理', async t => {
	const h = await interfaceFixture(t);
	h.lib.config.ui_zoom = '120%';
	h.lib.onresize = [];
	h.game.deviceZoom = .6; h.game.documentZoom = .6;
	window.inSplash = true;
	const background = h.ui.beautifyStartInterface_background;
	const button = background.lobby.querySelectorAll('button').find(button => button.getAttribute('aria-label') === '武将');
	const open = button.listeners.get('click')[0];
	let reloads = 0;
	h.game.reload = () => reloads++;
	await open();
	assert.ok(h.document.body.querySelector('.hh-character-browser'));
	assert.equal(background.lobby.inert, true);
	assert.equal(h.document.body.classList.contains('hh-startup-character-open'), true);
	assert.equal(Number(h.document.body.style['--hh-startup-character-zoom']), .72);
	h.game.deviceZoom = .8; h.game.documentZoom = .8;
	for (const resize of h.lib.onresize) resize();
	await Promise.resolve();
	assert.equal(Number(h.document.body.style['--hh-startup-character-zoom']), .96);
	assert.equal(h.game.documentZoom, .8, '目录只读取缩放，不提前初始化游戏');
	h.document.body.querySelector('.hh-character-back').emit('click');
	assert.equal(h.document.body.querySelector('.hh-character-browser'), null);
	assert.equal(background.lobby.inert, false);
	assert.equal(h.document.body.classList.contains('hh-startup-character-open'), false);
	assert.equal(h.document.body.classList.contains('hh-startup-active'), true);
	assert.ok(background.isConnected);
	await open();
	h.startup.content();
	assert.equal(h.document.body.querySelector('.hh-character-browser'), null);
	assert.equal(h.document.body.classList.contains('hh-startup-character-open'), false);
	assert.equal(h.ui.beautifyStartInterface_background, undefined);
	assert.equal(h.lib.onresize.length, 0);
	assert.equal(reloads, 0);
	assert.equal(h.lib.config.mode, undefined);
});
