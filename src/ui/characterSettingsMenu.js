// Refresh already-created native settings pages without invoking their toggle handlers.
export function refreshCharacterSettingsMenus({ lib, ui }, catalog) {
	for (const [container, online] of [[ui.menuContainer, false], [ui.connectMenuContainer, true]]) {
		if (!container?.querySelectorAll) continue;
		const tabs = Array.from(container.querySelectorAll('.menu-tab')).flatMap(bar => Array.from(bar.children));
		const page = tabs.find(tab => tab._link && tab.textContent.trim() === '武将')?._link;
		if (!page?.firstChild) continue;
		const start = tabs[0]?._link;
		const mode = online ? Array.from(start?.firstChild?.children || []).find(node => node.classList.contains('active'))?.mode || lib.configOL?.mode || catalog.mode : catalog.mode;
		const banned = lib.config[`${online ? 'connect_' : ''}${mode}_banned`] || [];
		for (const node of page.firstChild.children) {
			if (!catalog.packs.some(pack => pack.id === node.mode)) continue;
			const enabled = catalog.isPackEnabled(node.mode, online);
			if (catalog.canTogglePack(node.mode)) node.classList.toggle('off', !enabled);
			if (!node.link?.querySelectorAll) continue;
			for (const row of node.link.querySelectorAll('.config')) {
				const config = row._link?.config; if (!config) continue;
				const group = catalog.groups.get(node.mode + ':' + config._name);
				const state = config._name === node.mode && config.name === '开启' ? enabled : group ? group.ids.some(id => !banned.includes(id)) : null;
				if (state !== null) { row.classList.toggle('on', state); config.init = state; }
			}
			for (const card of node.link.querySelectorAll('.character')) {
				if (typeof card.updateBanned === 'function') {
					try { card.updateBanned(); } catch (error) { console.warn('[HH优化] 刷新武将设置显示失败', error); }
				}
			}
		}
	}
}
