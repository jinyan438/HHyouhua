import { defaultSettings } from './defaults.js';

export const normalizePreference = (key, value) => key === 'outcropSkin' && value === false ? 'off' : value;

export function applyMenuDefaults(config) {
	for (const [key, value] of Object.entries(defaultSettings)) {
		const option = config[key];
		if (!option || !Object.hasOwn(option, 'init')) continue;
		const next = normalizePreference(key, value);
		if (typeof option.intro === 'string') option.intro = option.intro.replaceAll(`默认${option.init}`, `默认${next}`);
		option.init = next;
	}
	return config;
}

// Defaults fill missing values; saved preferences (including false and zero) win.
export async function migratePreferences(lib, game) {
	const oldPrefix = 'extension_十周年UI_';
	const prefix = 'extension_HH优化_';
	const values = { ...defaultSettings };
	for (const [key, value] of Object.entries(lib.config)) {
		if (key.startsWith(oldPrefix) && key !== oldPrefix + 'enable') values[key.slice(oldPrefix.length)] = value;
	}
	const saves = [];
	for (const [key, value] of Object.entries(values)) {
		const target = prefix + key;
		const current = Object.hasOwn(lib.config, target) ? lib.config[target] : value;
		const normalized = normalizePreference(key, current);
		if (!Object.hasOwn(lib.config, target) || normalized !== current) saves.push(game.promises.saveConfig(target, normalized));
	}
	if (lib.config.extensions?.includes('十周年UI')) {
		saves.push(game.promises.saveConfig('extensions', lib.config.extensions.filter(name => name !== '十周年UI')));
	}
	if (lib.config.extension_十周年UI_enable) saves.push(game.promises.saveConfig('extension_十周年UI_enable', false));
	if (lib.config.extension_HH优化_mergedVersion !== 1) saves.push(game.promises.saveConfig('extension_HH优化_mergedVersion', 1));
	await Promise.all(saves);
}
