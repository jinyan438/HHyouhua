import { sourceCardAudioAssets as assets } from './sourceCardAudioAssets.js';

export function setupSourceCardAudio({ lib, game, get }, options = {}) {
	if (game.hhCardAudio) return game.hhCardAudio;
	const originalPlayAudio = game.playAudio;
	const replacing = () => (lib.config?.extension_HH优化_enable_audio_replace ?? options.enable_audio_replace ?? true) !== false;
	const enabled = () => replacing() && lib.config?.background_audio !== false;
	const equipmentType = card => {
		const subtype = get.subtype?.(card) || 'equip1';
		return subtype === 'equip6' ? 'equip3' : subtype;
	};
	function play(file, fallback) {
		if (!enabled() || typeof originalPlayAudio !== 'function') return;
		let failed = false;
		const onError = () => { if (!failed) { failed = true; fallback?.(); } };
		try { return game.playAudio({ path: 'ext:HH优化/assets/card-audio/' + file, onError }); }
		catch (error) { console.warn('[HH优化] 卡牌音效播放失败', error); onError(); }
	}
	const audio = game.hhCardAudio = {
		playSteal() {
			return play(assets.steal);
		},
		playEquip(card) {
			if (!enabled()) return;
			const fallback = () => originalPlayAudio?.call(game, 'effect', equipmentType(card));
			const file = assets.equipment[card?.name];
			return file ? play(file, fallback) : fallback();
		},
	};
	if (typeof originalPlayAudio === 'function') game.playAudio = function (...args) {
		const path = args.length === 1 && args[0] && typeof args[0] === 'object'
			? args[0].path : args.filter(value => typeof value === 'string' || typeof value === 'number').join('/');
		// Native equip sounds are replaced on equipAfter, including direct grants.
		// The legacy HH wrapper can already have rewritten the same sound path.
		if (replacing() && typeof path === 'string' && /^(?:effect\/|ext:HH优化\/effect\/|\.\.\/extension\/HH优化\/effect\/)equip[1-6](?:\.(?:mp3|ogg|wav))?$/.test(path)) return;
		return originalPlayAudio.apply(this, args);
	};
	return audio;
}
