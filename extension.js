import { lib, game, ui, get, ai, _status } from 'noname';
import { createRecoveryExtension, recoverPendingUpdate, updateConfig } from './updater.js';
import { setupBackgrounds, refreshExtensionBackground } from './src/ui/backgrounds.js';
import { migrateOriginalCardLayout, prioritizeOriginalCardMenu } from './src/ui/originalCards.js';
import { createLLMConfig } from './src/llm/settings.js';
import { setupLLMTakeover } from './src/llm/controller.js';

export const type = 'extension';

export default async function () {
	if (!_status.importingExtension) {
		const recoveryError = await recoverPendingUpdate(game);
		if (recoveryError) return createRecoveryExtension(lib, game, ui, _status, recoveryError);
	}
	const [{ createHHFeatures }, { applyMenuDefaults, migratePreferences }, { createStartupInterface }, { migrateStartupPreferences }] = await Promise.all([
		import('./hh-features.js'), import('./preferences.js'),
		import('./src/ui/startup.js'), import('./src/ui/startupMedia.js'),
	]);
	const hh = createHHFeatures(lib, game, ui, get, ai, _status);
	const startup = createStartupInterface(lib, game, ui, get, ai, _status);
	const info = await lib.init.promises.json(`${lib.assetURL}extension/HH优化/info.json`);
	const [{ config }, { precontent }, { content }] = await Promise.all([
		import('./src/config.js'), import('./src/precontent.js'), import('./src/content.js'),
	]);
	const legacyAlreadyLoaded = !!window.decadeModule && window.decadeUIName === '十周年UI';
	if (!_status.importingExtension && lib.config.extension_HH优化_enable) {
		await migratePreferences(lib, game);
		await migrateStartupPreferences(lib, game);
		await migrateOriginalCardLayout(lib, game);
		delete lib.extensionMenu.extension_十周年UI;
		delete lib.extensionMenu.extension_启动界面美化;
		const url = new URL(location.href);
		if (['十周年UI', '启动界面美化'].includes(url.searchParams.get('importExtensionName'))) {
			url.searchParams.set('importExtensionName', 'HH优化');
			history.replaceState(null, '', url);
		}
	}
	const pack = { ...hh.package, ...info };
	return {
		name: 'HH优化',
		editable: false,
		config: prioritizeOriginalCardMenu(applyMenuDefaults({ ...updateConfig(lib, game, ui, _status, info), ...hh.config, ...createLLMConfig({ lib, game, ui }), ...config, ...startup.config })),
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
			await startup.precontent();
		},
		async content(options, packageData) {
			delete lib.extensionMenu.extension_启动界面美化;
			startup.content();
			refreshExtensionBackground(lib, game);
			await content.call(this, options, packageData);
			await hh.content.call(this, options, packageData);
			setupLLMTakeover({ lib, game, ui, get, ai, _status });
		},
	};
}
