import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createStartupInterface } from '../src/ui/startup.js';
import { migrateStartupPreferences, loadStartupMedia, startupVideos, startupMusic, disposeStartupBackground } from '../src/ui/startupMedia.js';
import { domFixture } from './helpers/catalog-dom.mjs';

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
	assert.equal(Object.keys(config.backgroundMusicChoose.item).length, 7);
	for (const [folder, names] of [['video', startupVideos], ['music', startupMusic]]) {
		for (const name of names) assert.ok((await readFile(new URL('../assets/startup/' + folder + '/' + name, import.meta.url))).length > 0, name);
	}
});

test('扫描合并目录中的自定义媒体，去重并忽略其它文件', async () => {
	const config = { backgroundVideoChoose: {}, backgroundMusicChoose: {} }, lib = {}, paths = [];
	await loadStartupMedia(lib, { getFileList(path, done) { paths.push(path); done([], path.endsWith('video') ? ['孙尚香.mp4', '自定义.mp4', '开场-自定义.mp4', 'README.txt'] : ['自定义.mp3']); } }, config);
	assert.deepEqual(paths, ['extension/HH优化/assets/startup/video', 'extension/HH优化/assets/startup/music']);
	assert.equal(config.backgroundVideoChoose.item.自定义, '自定义(含开场动画)');
	assert.equal(config.backgroundMusicChoose.item.自定义, '自定义');
	assert.equal(lib.allBackgroundVideos.filter(name => name === '孙尚香.mp4').length, 1);
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
