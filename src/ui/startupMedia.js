export const startupAssetPath = 'extension/HH优化/assets/startup/';
export const startupVideos = ['孙尚香.mp4', '伊吹.mp4', '优香.mp4', '佳代子.mp4', '忧.mp4', '枫香.mp4', '开场-忧.mp4', '开场-枫香.mp4'];
export const startupMusic = ['Aira.mp3', 'Autumn （秋）.mp3', 'Hue.mp3', 'Irasshaimase.mp3', 'Koi is love.mp3', 'Sugar Story.mp3', 'sanguosha.mp3'];

export async function migrateStartupPreferences(lib, game) {
	const prefix = 'extension_HH优化_';
	const saves = [];
	for (const [key, fallback] of Object.entries({ startupInterface: true, previewEffect: 'none', backgroundMusicChoose: 'Aira', backgroundVideoChoose: '孙尚香', videoDisplayMode: 'cover' })) {
		if (Object.hasOwn(lib.config, prefix + key)) continue;
		// The merged interface starts with Sun Shangxiang; subsequent HH choices are kept.
		const value = ['backgroundMusicChoose', 'videoDisplayMode'].includes(key)
			? lib.config['extension_启动界面美化_' + key] ?? lib.config[key] ?? fallback : fallback;
		saves.push(game.promises.saveConfig(prefix + key, value));
	}
	if (!lib.config[prefix + 'startupMergedVersion']) {
		saves.push(game.promises.saveConfig('show_splash', lib.config.show_splash === 'always' ? 'always' : 'init'));
		saves.push(game.promises.saveConfig(prefix + 'startupMergedVersion', 1));
	}
	if (lib.config.extensions?.includes('启动界面美化')) {
		saves.push(game.promises.saveConfig('extensions', lib.config.extensions.filter(name => name !== '启动界面美化')));
	}
	if (lib.config.extension_启动界面美化_enable) saves.push(game.promises.saveConfig('extension_启动界面美化_enable', false));
	await Promise.all(saves);
}

export async function loadStartupMedia(lib, game, config) {
	const read = async (folder, bundled, extension) => {
		if (typeof game.getFileList !== 'function') return [...bundled];
		try {
			const files = await new Promise((resolve, reject) => game.getFileList(startupAssetPath + folder, (_folders, files) => resolve(files), reject));
			return [...new Set([...bundled, ...files.filter(name => typeof name === 'string' && name.endsWith(extension))])];
		} catch (error) {
			console.warn('启动界面媒体目录读取失败，使用内置列表。', error);
			return [...bundled];
		}
	};
	const [videos, music] = await Promise.all([read('video', startupVideos, '.mp4'), read('music', startupMusic, '.mp3')]);
	lib.allBackgroundVideos = videos;
	config.backgroundVideoChoose.item = Object.fromEntries(videos.filter(name => !name.startsWith('开场-')).map(name => {
		const title = name.slice(0, -4);
		return [title, title + (videos.includes('开场-' + name) ? '(含开场动画)' : '')];
	}));
	config.backgroundMusicChoose.item = Object.fromEntries(music.map(name => [name.slice(0, -4), name.slice(0, -4)]));
}

export function disposeStartupBackground(ui) {
	const background = ui.beautifyStartInterface_background;
	if (!background) return;
    background.disposeLobby?.();
	background.disposeMedia?.();
	background.remove();
	delete ui.beautifyStartInterface_background;
}

// Muted inline video can start before the first gesture on desktop and mobile browsers.
export function prepareStartupVideo(video) {
	video.muted = true;
	video.defaultMuted = true;
	video.playsInline = true;
	video.setAttribute('playsinline', '');
	video.setAttribute('webkit-playsinline', '');
}

const playback = new WeakMap();

export function playStartupMedia(media, background) {
	if (!media) return;
	const existing = playback.get(media);
	if (existing?.background === background) { existing.play(); return; }
	let listening = false;
	const clear = () => {
		document.removeEventListener('click', retry);
		document.removeEventListener('touchstart', retry);
		listening = false;
	};
	const retry = () => { clear(); if (background.isConnected) attempt(); };
	const attempt = () => {
		if (!background.isConnected) return;
		Promise.resolve(media.play()).catch(() => {
			if (listening || !background.isConnected) return;
			listening = true;
			document.addEventListener('click', retry);
			document.addEventListener('touchstart', retry);
		});
	};
	const dispose = background.disposeMedia;
	background.disposeMedia = () => { clear(); media.pause(); playback.delete(media); dispose?.(); };
	playback.set(media, { background, play: attempt });
	attempt();
}
