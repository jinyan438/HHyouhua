const lobbyParameter = 'hhReturnLobby';

// Read before the engine decides whether to import the last mode or show the lobby.
// This affects this load only; the saved splash preference stays untouched.
export function prepareSettlementLobby(lib, win = globalThis.window) {
	if (!win?.location?.href) return false;
	const url = new URL(win.location.href);
	if (url.searchParams.get(lobbyParameter) !== '1') return false;
	lib.config.show_splash = 'always';
	win.hhSettlementLobby = true;
	win.localStorage?.removeItem(lib.configprefix + 'directstart');
	win.localStorage?.removeItem('show_splash_off');
	url.searchParams.delete(lobbyParameter); win.history?.replaceState(null, '', url.href);
	return true;
}

export function returnToSettlementLobby({ lib, _status }, win = globalThis.window) {
	const url = new URL(win.location.href);
	url.searchParams.set(lobbyParameter, '1');
	win.localStorage?.removeItem(lib.configprefix + 'directstart');
	win.localStorage?.removeItem('show_splash_off');
	const previous = _status.reloading;
	_status.reloading = true;
	try { win.location.assign(url.href); }
	catch (error) { _status.reloading = previous; throw error; }
}
