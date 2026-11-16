export const allCharactersPack = '__all';
const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
const normalized = value => plain(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function createCharacterCatalog({ lib, game, get, _status = {} }) {
	const entries = new Map(), packs = [], groups = new Map();
	const translate = key => plain(lib.translate?.[key] || get.translation?.(key) || key);
	function add(id, raw, pack) {
		if (!raw || typeof raw !== 'object') return;
		const info = get.character?.(id) || raw;
		const tags = raw.trashBin || raw[4] || [];
		if (info.isUnseen || raw.isUnseen || Array.isArray(tags) && tags.includes('unseen')) return;
		if (!entries.has(id)) {
			const skills = Array.from(info.skills || raw.skills || raw[3] || []);
			const hp = info.hp ?? raw.hp ?? raw[2] ?? 0;
			const group = info.group || raw.group || raw[1] || '';
			const name = translate(id);
			entries.set(id, { id, name, raw, info, group, sex: info.sex || raw.sex || raw[0] || '', hp, maxHp: info.maxHp ?? raw.maxHp ?? hp, skills, packs: [], search: normalized([id, name, ...skills.map(translate)].join(' ')) });
		}
		const entry = entries.get(id);
		if (!entry.packs.includes(pack.id)) entry.packs.push(pack.id);
		if (!pack.ids.includes(id)) pack.ids.push(id);
	}
	for (const [id, characters] of Object.entries(lib.characterPack || {})) {
		if (['mode_favourite', 'mode_banned'].includes(id) || !characters || typeof characters !== 'object') continue;
		const pack = { id, name: plain(lib.translate?.[id + '_character_config'] || lib.translate?.[id]) || id.replace(/^mode_extension_/, ''), ids: [] };
		for (const [name, raw] of Object.entries(characters)) add(name, raw, pack);
		if (pack.ids.length) packs.push(pack);
	}
	const other = { id: '__other', name: '其他武将', ids: [] };
	for (const [id, raw] of Object.entries(lib.character || {})) if (!entries.has(id)) add(id, raw, other);
	if (other.ids.length) packs.push(other);
	const all = { id: allCharactersPack, name: '全部', ids: Array.from(entries.keys()) };
	packs.unshift(all);
	for (const item of packs.slice(1)) {
		const sorts = lib.characterSort?.[item.id];
		for (const [id, ids] of Object.entries(sorts || {})) {
			if (!Array.isArray(ids)) continue;
			const members = [...new Set(ids)].filter(name => item.ids.includes(name));
			if (members.length) groups.set(item.id + ':' + id, { id, pack: item.id, name: translate(id), ids: members });
		}
	}
	const mode = get.mode?.() || lib.config?.mode || 'identity';
	const configKey = `${_status.connectMode ? 'connect_' : ''}${mode}_banned`;
	const pending = new Map(); let writes = Promise.resolve();
	const isBanned = id => Array.isArray(lib.config[configKey]) && lib.config[configKey].includes(id);
	const packKey = online => online ? 'connect_characters' : 'characters';
	function legacyExtension(id) { return id.startsWith('mode_extension_') ? id.slice(15) : null; }
	function legacyAvailable(name) { return (!game.hasExtension || game.hasExtension(name)) && (!game.hasExtensionLoaded || game.hasExtensionLoaded(name)); }
	function canTogglePack(id) {
		if (!packs.some(item => item.id === id) || [allCharactersPack, '__other'].includes(id)) return false;
		const ext = legacyExtension(id);
		if (ext) return legacyAvailable(ext) && !lib.config.all?.stockextension?.includes(ext);
		return !id.startsWith('mode_');
	}
	function isPackEnabled(id, online = !!_status.connectMode) {
		if ([allCharactersPack, '__other'].includes(id)) return true;
		const ext = legacyExtension(id);
		if (ext) { const flag = lib.config[`extension_${ext}_characters_enable`]; return legacyAvailable(ext) && (flag === undefined || flag === true); }
		if (id.startsWith('mode_')) return true;
		const values = lib.config[packKey(online)];
		const contains = Array.isArray(values) && values.includes(id); return online ? !contains : contains;
	}
	function isCharacterPackEnabled(id, selected = allCharactersPack) {
		const entry = entries.get(id); if (!entry) return false;
		if (selected !== allCharactersPack && entry.packs.includes(selected)) return isPackEnabled(selected);
		return entry.packs.some(isPackEnabledForCurrentMode);
	}
	const isPackEnabledForCurrentMode = id => isPackEnabled(id);
	const isEnabled = (id, selected = allCharactersPack) => !isBanned(id) && isCharacterPackEnabled(id, selected);
	function list({ pack = allCharactersPack, query = '', status = 'all' } = {}) {
		const words = normalized(query), selected = packs.find(item => item.id === pack) || all;
		return selected.ids.map(id => entries.get(id)).filter(entry => (!words || entry.search.includes(words)) && (status === 'all' || (status === 'enabled') === isEnabled(entry.id, selected.id)));
	}
	function counts(pack) {
		const ids = (packs.find(item => item.id === pack) || all).ids;
		return { enabled: ids.filter(id => isEnabled(id, pack)).length, total: ids.length };
	}
	function enqueue(key, operation) {
		if (pending.has(key)) return pending.get(key);
		const task = writes.then(operation); pending.set(key, task); writes = task.catch(() => {});
		task.then(() => pending.delete(key), () => pending.delete(key)); return task;
	}
	async function save(key, value) {
		if (typeof game.promises?.saveConfig === 'function') await game.promises.saveConfig(key, value);
		else await game.saveConfig(key, value);
	}
	function writeBans(update) {
			const existed = Object.prototype.hasOwnProperty.call(lib.config, configKey), previous = lib.config[configKey];
			const liveAlias = !_status.connectMode && lib.config.mode === mode, previousAlias = lib.config.banned;
			const { next, result } = update(Array.isArray(previous) ? [...previous] : []);
			lib.config[configKey] = next;
			if (liveAlias) lib.config.banned = next;
			return save(configKey, next).then(() => result, error => {
				if (lib.config[configKey] === next) { if (existed) lib.config[configKey] = previous; else delete lib.config[configKey]; }
				if (liveAlias && lib.config.banned === next) { if (previousAlias === undefined) delete lib.config.banned; else lib.config.banned = previousAlias; }
				throw error;
			});
	}
	function toggle(id) {
		if (!entries.has(id)) return Promise.reject(new Error('找不到该武将'));
		return enqueue('character:' + id, () => writeBans(previous => {
			const banned = !isBanned(id), next = previous.filter(name => name !== id); if (banned) next.push(id);
			return { next, result: banned };
		}));
	}
	function togglePack(id) {
		if (!canTogglePack(id)) return Promise.reject(new Error('此分类没有武将包开关'));
		return enqueue('pack:' + id, async () => {
			const ext = legacyExtension(id), online = !!_status.connectMode;
			const key = ext ? `extension_${ext}_characters_enable` : packKey(online);
			const existed = Object.prototype.hasOwnProperty.call(lib.config, key), previous = lib.config[key], enabled = !isPackEnabled(id);
			let next = enabled;
			if (!ext) { next = Array.isArray(previous) ? previous.filter(name => name !== id) : []; if (online !== enabled) next.push(id); }
			lib.config[key] = next;
			try { await save(key, next); }
			catch (error) { if (lib.config[key] === next) { if (existed) lib.config[key] = previous; else delete lib.config[key]; } throw error; }
			return enabled;
		});
	}
	function groupEnabled(pack, id) { return groups.get(pack + ':' + id)?.ids.some(name => !isBanned(name)) || false; }
	function canToggleGroup(pack, id) { return groups.has(pack + ':' + id) && (!pack.startsWith('mode_') || !!legacyExtension(pack) && legacyAvailable(legacyExtension(pack))); }
	function toggleGroup(pack, id) {
		const group = groups.get(pack + ':' + id);
		if (!group || !canToggleGroup(pack, id)) return Promise.reject(new Error('找不到可切换的分包'));
		return enqueue('group:' + pack + ':' + id, () => writeBans(previous => {
			const enabled = !groupEnabled(pack, id), members = new Set(group.ids), next = previous.filter(name => !members.has(name));
			if (!enabled) next.push(...group.ids); return { next, result: enabled };
		}));
	}
	function sections(options = {}) {
		const selected = options.pack || allCharactersPack, visible = new Set(list(options).map(entry => entry.id)), seen = new Set(), result = [];
		for (const item of packs.slice(1)) {
			if (selected !== allCharactersPack && selected !== item.id) continue;
			const sorts = [...groups.values()].filter(group => group.pack === item.id), assigned = new Set();
			const add = (group, ids) => {
				const rows = ids.filter(id => { if (!visible.has(id) || seen.has(id)) return false; seen.add(id); return true; }).map(id => entries.get(id));
				if (!rows.length) return;
				const name = group ? (selected === allCharactersPack && !group.name.startsWith(item.name) ? item.name + ' · ' + group.name : group.name) : item.name;
				result.push({ key: item.id + ':' + (group?.id || '__pack'), pack: item.id, group: group?.id || null, name, ids, entries: rows, header: selected === allCharactersPack || !!sorts.length });
			};
			for (const group of sorts) { const ids = group.ids.filter(id => !assigned.has(id)); group.ids.forEach(id => assigned.add(id)); add(group, ids); }
			const remaining = item.ids.filter(id => !assigned.has(id));
			if (remaining.length) add(null, remaining);
		}
		return result;
	}
	return { entries, packs, groups, mode, configKey, list, sections, counts, isBanned, isEnabled, canTogglePack, isPackEnabled, isCharacterPackEnabled, toggle, togglePack, groupEnabled, canToggleGroup, toggleGroup };
}

// Cancel long presses when a pointer scrolls, leaves the card or the view closes.
export function bindCharacterPress(node, { open, toggle, pointerEvents = true, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
	let timer, start, held = false, suppressedUntil = 0;
	const bindings = [];
	const on = (type, fn, options) => { node.addEventListener(type, fn, options); bindings.push([type, fn, options]); };
	function cancel() { if (timer !== undefined) clearTimer(timer); timer = undefined; start = null; }
	function end() { if (held) suppressedUntil = now() + 900; held = false; cancel(); }
	function down(event) {
		if (event.button !== undefined && event.button !== 0 || event.isPrimary === false || event.touches?.length > 1) return cancel();
		cancel(); held = false; const point = event.touches?.[0] || event;
		start = { x: point.clientX, y: point.clientY };
		timer = setTimer(() => { timer = undefined; start = null; held = true; suppressedUntil = now() + 900; toggle(); }, 600);
	}
	function move(event) { const point = event.touches?.[0] || event; if (start && Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) { suppressedUntil = now() + 400; cancel(); } }
	if (pointerEvents) { on('pointerdown', down); on('pointermove', move, { passive: true }); for (const name of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) on(name, end); }
	else { on('touchstart', down, { passive: true }); on('touchmove', move, { passive: true }); on('touchend', end); on('touchcancel', end); on('mousedown', down); on('mousemove', move); on('mouseup', end); on('mouseleave', end); }
	on('click', event => { event.stopPropagation(); if (now() < suppressedUntil) { event.preventDefault(); return; } open(); });
	on('contextmenu', event => { event.preventDefault(); event.stopPropagation(); cancel(); if (now() >= suppressedUntil) { suppressedUntil = now() + 900; toggle(); } });
	on('keydown', event => { if (!event.repeat && (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) { event.preventDefault(); cancel(); toggle(); } });
	return { cancel, destroy() { cancel(); for (const binding of bindings) node.removeEventListener(...binding); } };
}
