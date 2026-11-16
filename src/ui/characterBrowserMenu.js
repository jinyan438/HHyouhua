export function addCharacterCatalogMenu(context, parent, { popup = parent, close, layout = 'flow' } = {}) {
	if (parent.querySelector('.hh-character-menu-button')) return;
	const { game } = context, doc = parent.ownerDocument;
	const button = doc.createElement('button'); button.type = 'button'; button.className = 'hh-character-menu-button' + (layout === 'flow' ? ' controls' : '');
	button.dataset.layout = layout; button.setAttribute('aria-label', '武将');
	const icon = doc.createElement('span'); icon.className = 'hh-character-menu-icon'; icon.setAttribute('aria-hidden', 'true');
	const label = doc.createElement('span'); label.textContent = '武将'; button.appendChild(icon); button.appendChild(label);
	if (layout === 'fixed') {
		const items = Array.from(parent.querySelectorAll('.SZ,.LK,.BJ,.TX,.TG')).sort((a, b) => a.offsetTop - b.offsetTop);
		const reference = items[0];
		if (reference) {
			const width = reference.offsetWidth || 56, height = reference.offsetHeight || 58, top = reference.offsetTop, left = reference.offsetLeft;
			const stack = doc.createElement('div'); stack.className = 'hh-character-menu-stack';
			Object.assign(stack.style, { left: `${left - 3}px`, top: `${top}px`, width: `${width + 6}px`, maxHeight: `calc(100% - ${top + 10}px)` });
			parent.querySelector('.HOME')?.style.setProperty('display', 'none');
			for (const item of items) { Object.assign(item.style, { position: 'relative', top: 'auto', bottom: 'auto', left: 'auto', right: 'auto', width: `${width}px`, height: `${height}px`, flexShrink: '0' }); stack.appendChild(item); }
			Object.assign(button.style, { width: `${width}px`, height: `${height}px` }); stack.appendChild(button); parent.appendChild(stack);
		} else parent.appendChild(button);
	} else if (layout === 'row') {
		const reference = parent.querySelector('.shezhi'), background = parent.querySelector('.yemian');
		if (reference) {
			const step = (reference.offsetWidth || 65) + 15;
			Object.assign(button.style, { position: 'fixed', left: `${reference.offsetLeft - step}px`, top: `${reference.offsetTop}px`, width: `${reference.offsetWidth || 65}px`, height: `${reference.offsetHeight || 50}px` });
			if (background) Object.assign(background.style, { width: `${background.offsetWidth + step}px`, left: `${background.offsetLeft - step}px` });
		}
		parent.appendChild(button);
	} else {
		const top = parent.offsetTop;
		Object.assign(parent.style, { top: `${top}px`, bottom: 'auto', height: 'auto', maxHeight: `calc(100% - ${top + 10}px)`, overflowY: 'auto' }); parent.appendChild(button);
	}
	button.addEventListener('click', async event => {
		event.stopPropagation();
		if (close) close(); else if (popup.delete) popup.delete(0); else popup.remove();
		try {
			if (!game.hhCharacterBrowser) {
				const { createCharacterBrowser } = await import('./characterBrowser.js');
				game.hhCharacterBrowser ||= createCharacterBrowser(context);
			}
			game.hhCharacterBrowser.open();
		} catch (error) { console.error('[HH优化] 武将界面加载失败', error); game.alert?.('武将界面加载失败，请重启游戏后重试'); }
	});
	return button;
}
