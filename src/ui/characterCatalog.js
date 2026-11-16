export const allCharactersPack = '__all';
const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
const normalized = value => plain(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function createCharacterCatalog({ lib, game, get, _status = {} }) {
	const entries = new Map(), packs = [];
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
	const mode = get.mode?.() || lib.config?.mode || 'identity';
	const configKey = `${_status.connectMode ? 'connect_' : ''}${mode}_banned`;
	const pending = new Map(); let writes = Promise.resolve();
	const isBanned = id => Array.isArray(lib.config[configKey]) && lib.config[configKey].includes(id);
	function list({ pack = allCharactersPack, query = '', status = 'all' } = {}) {
		const words = normalized(query), selected = packs.find(item => item.id === pack) || all;
		return selected.ids.map(id => entries.get(id)).filter(entry => (!words || entry.search.includes(words)) && (status === 'all' || (status === 'disabled') === isBanned(entry.id)));
	}
	function counts(pack) {
		const ids = (packs.find(item => item.id === pack) || all).ids;
		return { enabled: ids.filter(id => !isBanned(id)).length, total: ids.length };
	}
	function toggle(id) {
		if (!entries.has(id)) return Promise.reject(new Error('找不到该武将'));
		if (pending.has(id)) return pending.get(id);
		const task = writes.then(async () => {
			const existed = Object.prototype.hasOwnProperty.call(lib.config, configKey), previous = lib.config[configKey];
			const liveAlias = !_status.connectMode && lib.config.mode === mode, previousAlias = lib.config.banned;
			const next = Array.isArray(previous) ? previous.filter(name => name !== id) : [];
			const banned = !isBanned(id); if (banned) next.push(id);
			lib.config[configKey] = next;
			if (liveAlias) lib.config.banned = next;
			try {
				if (typeof game.promises?.saveConfig === 'function') await game.promises.saveConfig(configKey, next);
				else await game.saveConfig(configKey, next);
			} catch (error) {
				if (lib.config[configKey] === next) { if (existed) lib.config[configKey] = previous; else delete lib.config[configKey]; }
				if (liveAlias && lib.config.banned === next) { if (previousAlias === undefined) delete lib.config.banned; else lib.config.banned = previousAlias; }
				throw error;
			}
			return banned;
		});
		pending.set(id, task); writes = task.catch(() => {});
		task.then(() => pending.delete(id), () => pending.delete(id));
		return task;
	}
	return { entries, packs, mode, configKey, list, counts, isBanned, toggle };
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
