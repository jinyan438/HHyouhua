import { lib, game, ui, get, ai, _status } from 'noname';
import { createRecoveryExtension, recoverPendingUpdate, updateConfig } from './updater.js';
import { setupBackgrounds, refreshExtensionBackground } from './src/ui/backgrounds.js';

export const type = 'extension';

export default async function () {
	if (!_status.importingExtension) {
		const recoveryError = await recoverPendingUpdate(game);
		if (recoveryError) return createRecoveryExtension(lib, game, ui, _status, recoveryError);
	}
	const [{ createHHFeatures }, { applyMenuDefaults, migratePreferences }] = await Promise.all([
		import('./hh-features.js'), import('./preferences.js'),
	]);
	const hh = createHHFeatures(lib, game, ui, get, ai, _status);
	const info = await lib.init.promises.json(`${lib.assetURL}extension/HH优化/info.json`);
	const [{ config }, { precontent }, { content }] = await Promise.all([
		import('./src/config.js'), import('./src/precontent.js'), import('./src/content.js'),
	]);
	const legacyAlreadyLoaded = !!window.decadeModule && window.decadeUIName === '十周年UI';
	if (!_status.importingExtension && lib.config.extension_HH优化_enable) {
		await migratePreferences(lib, game);
		delete lib.extensionMenu.extension_十周年UI;
		const url = new URL(location.href);
		if (url.searchParams.get('importExtensionName') === '十周年UI') {
			url.searchParams.set('importExtensionName', 'HH优化');
			history.replaceState(null, '', url);
		}
	}
	const pack = { ...hh.package, ...info };
	return {
		name: 'HH优化',
		editable: false,
		config: applyMenuDefaults({ ...updateConfig(lib, game, ui, _status, info), ...hh.config, ...config }),
		help: hh.help,
		package: pack,
		mainpackage: pack,
		files: hh.files,
		async precontent(options) {
			// On engines without replacement-aware loading, finish migration before a clean reload.
			if (legacyAlreadyLoaded) return new Promise(() => game.reload());
			window.decadeUIName = 'HH优化';
			window.decadeUIPath = `${lib.assetURL}extension/HH优化/`;
			await setupBackgrounds(lib, game, get);
			await precontent.call(this, options);
			await hh.precontent.call(this, options);
		},
		async content(options, packageData) {
			refreshExtensionBackground(lib, game);
			await content.call(this, options, packageData);
			await hh.content.call(this, options, packageData);
		},
	};
}
