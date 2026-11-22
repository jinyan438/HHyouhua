import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings } from '../defaults.js';
import { migratePreferences, normalizePreference } from '../preferences.js';

function setup(config) {
	const writes = [];
	const lib = { config };
	const game = { promises: { async saveConfig(key, value) { config[key] = value; writes.push(key); } } };
	return { lib, game, writes };
}

test('旧设置迁移到单一扩展，保留已保存的 false、0、null 及用户后续调整', async () => {
	const { lib, game, writes } = setup({
		extensions: ['其它扩展', '十周年UI', 'HH优化'], extension_十周年UI_enable: true,
		extension_十周年UI_cardScale: .31, extension_十周年UI_dynamicSkin: true,
		extension_十周年UI_futureOption: 'saved', extension_HH优化_dynamicSkin: false,
		extension_HH优化_crop_left: 0, extension_HH优化_cardbj: null,
		extension_HH优化_enable_lord_blind_shot: false,
		extension_HH优化_disable_native_kill_effect: true,
		extension_HH优化_player_width: '149', extension_HH优化_player_height: '225', unrelated: 'keep',
	});
	await migratePreferences(lib, game);
	assert.deepEqual(lib.config.extensions, ['其它扩展', 'HH优化']);
	assert.equal(lib.config.extension_十周年UI_enable, false);
	assert.equal(lib.config.extension_HH优化_cardScale, .31);
	assert.equal(lib.config.extension_HH优化_dynamicSkin, false);
	assert.equal(lib.config.extension_HH优化_crop_left, 0);
	assert.equal(lib.config.extension_HH优化_cardbj, null);
	assert.equal(lib.config.extension_HH优化_enable_lord_blind_shot, false);
	assert.equal(lib.config.extension_HH优化_disable_native_kill_effect, true);
	assert.equal(lib.config.extension_HH优化_player_width, '149');
	assert.equal(lib.config.extension_HH优化_player_height, '225');
	assert.equal(lib.config.extension_HH优化_futureOption, 'saved');
	assert.equal(lib.config.unrelated, 'keep');
	const count = writes.length;
	await migratePreferences(lib, game);
	assert.equal(writes.length, count, '再次启动不重复写入或覆盖设置');
});

test('无旧设置的新安装使用导出的全部默认值，不修改其它扩展与全局设置', async () => {
	const { lib, game } = setup({ extensions: ['HH优化'], theme: 'woodden', extension_other_enable: true });
	await migratePreferences(lib, game);
	assert.equal(Object.keys(defaultSettings).length, 156);
	for (const [key, value] of Object.entries(defaultSettings)) {
		assert.deepEqual(lib.config['extension_HH优化_' + key], normalizePreference(key, value), key);
	}
	assert.equal(lib.config.theme, 'woodden');
	assert.equal(lib.config.extension_other_enable, true);
	assert.equal(lib.config.extension_HH优化_newDecadeStyle, 'onlineUI');
	assert.equal(lib.config.extension_HH优化_player_width, '136');
	assert.equal(lib.config.extension_HH优化_player_height, '180');
	assert.equal(lib.config.extension_HH优化_speed_multiplier, 2.5);
	assert.equal(lib.config.extension_HH优化_disable_native_kill_effect, false);
});
