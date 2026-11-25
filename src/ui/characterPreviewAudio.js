// The splash has no ui.window yet. Keep preview audio local to the catalog
// instead of creating a game window or using the gameplay audio lifecycle.
export function createCharacterPreviewAudio({ lib, game, get }, doc = globalThis.document) {
	return ({ path, onError = () => {} }) => {
		const audio = doc.createElement('audio');
		audio.volume = Math.max(0, Math.min(1, Number(lib.config.volumn_audio ?? 8) / 8));
		audio.autoplay = true;
		doc.body.appendChild(audio);
		const fail = () => {
			if (!audio.isConnected) return;
			audio.remove(); onError();
		};
		audio.onended = () => audio.remove();
		audio.onerror = fail;
		audio.oncanplay = () => {
			if (audio.isConnected) Promise.resolve(audio.play()).catch(error => console.warn('[HH优化] 台词播放失败', error));
		};
		Promise.resolve().then(async () => {
			let src;
			if (path.startsWith('db:')) {
				const key = path.slice(3).replace(/^([^:/]+)\//, '$1:');
				const blob = await game.getDB('image', key);
				if (!audio.isConnected) return;
				src = get.objectURL(blob);
			} else if (/^(?:blob:|data:|https?:|file:)/i.test(path)) src = path;
			else {
				const relative = path.startsWith('ext:') ? path.replace(/^ext:/, 'extension/') : 'audio/' + path;
				src = (lib.assetURL || '') + relative + (/\.[^/.]+$/.test(relative) ? '' : '.mp3');
			}
			// Closing or switching skills can happen while a database asset resolves.
			if (audio.isConnected) audio.src = src;
		}).catch(fail);
		return audio;
	};
}
