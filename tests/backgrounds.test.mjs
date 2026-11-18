import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultBackground, getBackgroundImage, setupBackgrounds, refreshExtensionBackground } from '../src/ui/backgrounds.js';

function fixture(config = {}) {
	const writes = [], updates = [];
	const menu = { item: { ol_bg: '龙纹', default: '默认' }, visualMenu() { return 'native'; } };
	const lib = { config, configMenu: { appearence: { config: { image_background: menu } } }, init: { background() {} } };
	const game = {
		promises: { async saveConfig(key, value) { config[key] = value; writes.push(key); } },
		updateBackground() { updates.push(config.image_background); },
	};
	return { lib, game, menu, writes, updates, get: { verticalStr: text => text } };
}

test('首次安装启用随扩展保存的背景，后续启动保留切换结果', async () => {
	const h = fixture({ image_background: 'ol_bg' });
	await setupBackgrounds(h.lib, h.game, h.get);
	assert.equal(h.lib.config.image_background, defaultBackground);
	assert.equal(Object.keys(h.menu.item)[0], defaultBackground);
	assert.equal(h.menu.item[defaultBackground], '金色龙纹');
	h.lib.config.image_background = 'noname_bg';
	await setupBackgrounds(h.lib, h.game, h.get);
	assert.equal(h.lib.config.image_background, 'noname_bg');
	assert.equal(h.writes.length, 2, '后续启动不覆盖或重复保存背景');
	refreshExtensionBackground(h.lib, h.game);
	assert.equal(h.updates.length, 0);
	h.lib.config.image_background = defaultBackground;
	refreshExtensionBackground(h.lib, h.game);
	assert.deepEqual(h.updates, [defaultBackground]);
});

test('原生外观菜单使用扩展内的 PNG，普通背景仍走原生绘制', async () => {
	const h = fixture({ extension_HH优化_dragonBackgroundInstalled: true });
	await setupBackgrounds(h.lib, h.game, h.get);
	const node = { style: {}, firstChild: {}, setBackgroundImage(path) { this.path = path; } };
	h.menu.visualMenu(node, defaultBackground, '金色龙纹');
	assert.equal(node.path, 'extension/HH优化/image/background/big_26.png');
	assert.equal(node.style.backgroundSize, 'cover');
	assert.equal(node.firstChild.innerHTML, '金色龙纹');
	assert.equal(h.menu.visualMenu(node, 'ol_bg', '龙纹'), 'native');
	assert.equal(getBackgroundImage('ol_bg'), 'image/background/ol_bg.jpg');
});

test('重启后仍保留隐藏的背景', async () => {
	const h = fixture({ extension_HH优化_dragonBackgroundInstalled: true, hiddenBackgroundPack: [defaultBackground], image_background: 'ol_bg' });
	await setupBackgrounds(h.lib, h.game, h.get);
	assert.equal(h.menu.item[defaultBackground], undefined);
	assert.equal(h.lib.config.image_background, 'ol_bg');
	assert.equal(h.writes.length, 0);
});
