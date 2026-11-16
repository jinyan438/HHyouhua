const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';

export function characterSkillTags(info = {}) {
	const types = [];
	if (info.enable) types.push({ type: 'active', label: '主动' });
	if (info.trigger || !info.enable) types.push({ type: 'passive', label: '被动' });
	const labels = [
		[info.zhuSkill, '主公技'], [info.limited, '限定技'], [info.juexingji, '觉醒技'],
		[info.locked === true || info.forced && info.locked !== false, '锁定技'],
		[info.zhuanhuanji, '转换技'], [info.dutySkill, '使命技'], [info.hiddenSkill, '隐匿技'],
		[info.clanSkill, '宗族技'], [info.chargeSkill, '蓄力技'],
	].filter(([enabled]) => enabled).map(([, label]) => label);
	return { types, labels };
}

// Browse the same installed files and configuration as the native skin picker.
export function createCharacterSkins({ lib, game, get, _status = {} }) {
	let writes = Promise.resolve();
	const owner = id => id.startsWith('gz_shibing') ? id.slice(3, 11) : id.startsWith('gz_') ? id.slice(3) : id;
	const substitutes = id => lib.characterSubstitute?.[owner(id)] || [];
	function image(id, tags = []) {
		const info = lib.character?.[id];
		if (typeof info?.img === 'string') return info.img;
		for (const value of info?.trashBin || info?.[4] || tags) {
			if (typeof value !== 'string') continue;
			if (value.startsWith('img:')) return value.slice(4);
			if (value.startsWith('ext:')) return value.replace(/^ext:/, 'extension/');
			if (value.startsWith('character:')) return 'image/character/' + value.slice(10) + '.jpg';
			if (value.startsWith('db:')) return value;
		}
		return 'image/character/' + id + '.jpg';
	}
	const original = id => ({ key: 'original', name: '经典形象', character: id, image: null });
	function selected(id, choices) {
		const saved = lib.config.skin?.[owner(id)];
		return choices.find(choice => choice.value !== undefined && (Array.isArray(saved) ? choice.value === saved[0] && choice.image === saved[1] : choice.value === saved)) || choices[0];
	}
	async function list(id) {
		const choices = [original(id)], seen = new Set();
		for (const [skin, tags] of substitutes(id)) {
			if (skin === id || seen.has(skin)) continue; seen.add(skin);
			choices.push({ key: 'character:' + skin, name: plain(lib.translate?.[skin]) || skin, character: skin, image: image(skin, tags), value: skin, substitute: true });
		}
		const folder = get.skinPath?.(id) || 'image/skin/' + owner(id) + '/';
		if (typeof game.getFileList === 'function') {
			const files = await new Promise(resolve => {
				try { game.getFileList(folder, (_folders, files) => resolve(files || []), () => resolve([])); }
				catch { resolve([]); }
			});
			for (const file of files.filter(file => /\.(?:jpe?g|png|webp|avif|gif)$/i.test(file)).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))) {
				choices.push({ key: 'file:' + file, name: plain(lib.translate?.[file.replace(/\.[^.]+$/, '')]) || file.replace(/\.[^.]+$/, ''), character: id, image: folder.replace(/\/?$/, '/') + file, value: file });
			}
		} else if (Number.isInteger(lib.skin?.[owner(id)])) {
			for (let i = 1; i <= lib.skin[owner(id)]; i++) choices.push({ key: 'legacy:' + i, name: '皮肤' + i, character: id, image: folder + i + '.jpg', value: i, legacy: true });
		}
		const saved = lib.config.skin?.[owner(id)];
		if (Array.isArray(saved) && saved[1] && !choices.some(choice => choice.value === saved[0] && choice.image === saved[1])) choices.push({ key: 'saved', name: plain(String(saved[0])).replace(/\.[^.]+$/, ''), character: id, image: saved[1], value: saved[0] });
		return choices;
	}
	function select(id, choice) {
		const task = writes.then(async () => {
			const previous = lib.config.skin, next = { ...previous }, key = owner(id);
			if (choice.value === undefined) { delete next[key]; for (const [skin] of substitutes(id)) delete next[skin]; }
			else {
				next[key] = choice.legacy ? choice.value : [choice.value, choice.image];
				if (!choice.substitute && !choice.legacy) {
					const dot = String(choice.value).lastIndexOf('.'), stem = String(choice.value).slice(0, dot), extension = String(choice.value).slice(dot + 1), folder = choice.image.slice(0, choice.image.lastIndexOf('/') + 1);
					for (const [skin] of substitutes(id)) next[skin] = [choice.value, `${folder}${stem}/${skin}.${extension}`];
				}
			}
			lib.config.skin = next;
			try {
				if (typeof game.promises?.saveConfig === 'function') await game.promises.saveConfig('skin', next);
				else await game.saveConfig('skin', next);
			} catch (error) { if (lib.config.skin === next) { if (previous === undefined) delete lib.config.skin; else lib.config.skin = previous; } throw error; }
			if (!_status.connectMode) for (const player of game.players || []) {
				for (const [name, avatar, index] of [[player.name1 || player.name, player.node?.avatar, 1], [player.name2, player.node?.avatar2, 2]]) {
					if (!name || owner(name) !== key) continue;
					try {
						if (substitutes(id).length && typeof player.changeSkinByName === 'function') player.changeSkinByName(choice.substitute ? choice.character : name, index);
						else avatar?.setBackground?.(name, 'character');
					} catch (error) { console.warn('[HH优化] 刷新对局皮肤失败', error); }
				}
			}
			return choice;
		});
		writes = task.catch(() => {}); return task;
	}
	return { list, selected, select, original };
}

// Preview locally: no skill activation, broadcast, or replay entry.
export function createCharacterVoice({ lib, game, get }) {
	let audio, sequence = 0;
	const positions = new Map();
	function stop() { sequence++; audio?.pause?.(); audio?.remove?.(); audio = null; }
	function play(skill, id, skin = id) {
		stop();
		if (lib.config.background_speak === false || lib.config.volumn_audio !== undefined && Number(lib.config.volumn_audio) === 0) return { muted: true };
		const info = get.character?.(id);
		const player = { name: id, sex: info?.sex || info?.[0] || 'male', skin: { name: skin }, tempname: skin === id ? [] : [skin] };
		const source = get.Audio?.skill?.({ skill, player });
		const list = source?.audioList || (source?.fileList || game.parseSkillAudio?.(skill, player) || []).map(file => ({ file }));
		if (!list.length) return { empty: true };
		const key = id + ':' + skin + ':' + skill, index = (positions.get(key) || 0) % list.length;
		positions.set(key, index + 1);
		const current = sequence;
		function attempt(offset) {
			if (current !== sequence || offset >= list.length) return;
			const item = list[(index + offset) % list.length];
			audio = game.playAudio({ path: item.file, addVideo: false, onError: () => attempt(offset + 1) });
		}
		attempt(0); return list[index];
	}
	return { play, stop };
}
