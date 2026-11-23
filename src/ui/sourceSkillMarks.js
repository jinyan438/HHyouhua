// Keep the engine's mark nodes, counters and click handlers; only describe their view.
function updateContent(mark) {
	const label = mark.text?.dataset.hhSourceMarkLabel;
	if (!label) return;
	if (!mark.hhSourceMarkContent && mark.ownerDocument) {
		const content = mark.ownerDocument.createElement('span');
		content.classList.add('hh-source-mark-content');
		mark.appendChild(content);
		mark.hhSourceMarkContent = content;
	}
	if (!mark.hhSourceMarkContent) return;
	const tip = mark.hhSourceMarkTip;
	mark.classList.toggle('hh-source-mark-with-tip', !!tip);
	if (tip) {
		// Reuse the engine's rendered message, including red suits, line breaks and status text.
		if (mark.hhSourceMarkContent.innerHTML !== tip.innerHTML) mark.hhSourceMarkContent.innerHTML = tip.innerHTML;
		return;
	}
	const count = String(mark.markcount?.textContent ?? '').trim();
	const text = label + (count ? `[${count}]` : '');
	if (mark.hhSourceMarkContent.textContent !== text || mark.hhSourceMarkContent.children.length) mark.hhSourceMarkContent.textContent = text;
}

const tipObservers = new WeakMap();

function syncTips(container, marks) {
	const player = container.parentNode;
	if (!player) return;
	const merged = new Set();
	for (const mark of marks) {
		const key = Object.keys(player.marks || {}).find(key => player.marks[key] === mark);
		const tip = player.tips?.get(key) || player.tips?.get(mark.skill);
		mark.hhSourceMarkTip = mark.classList.contains('hh-source-mark') && tip?.textContent.trim() ? tip : null;
		if (mark.hhSourceMarkTip) merged.add(tip);
	}
	for (const tip of player.tips?.values() || []) tip.classList.toggle('hh-source-mark-merged', merged.has(tip));
	const Observer = container.ownerDocument?.defaultView?.MutationObserver;
	if (!Observer || tipObservers.has(container)) return;
	// Native broadcast callbacks write tips directly, so observe their DOM as well as local updates.
	const observer = new Observer(records => {
		if (records.some(({ target }) => target === player || target === container || target === player.node?.tipContainer || player.node?.tipContainer?.contains(target))) {
			refreshSourceSkillMarks(container);
		}
	});
	observer.observe(player, { childList: true, characterData: true, subtree: true });
	tipObservers.set(container, observer);
}

export function decorateSourceSkillMark(mark, lib, { skill = mark.skill || mark.name, label } = {}) {
	const info = lib.skill[skill] || lib.skill[mark.skill];
	if (!mark.text || info?.juexingji || info?.limited || info?.zhuanhuanji || info?.zhuanhuanji2 || info?.markimage) {
		mark.classList.remove('hh-source-mark', 'hh-source-mark-with-tip');
		delete mark.dataset.hhSourceMark;
		if (mark.text) delete mark.text.dataset.hhSourceMarkLabel;
		mark.hhSourceMarkContent?.remove();
		delete mark.hhSourceMarkContent;
		delete mark.hhSourceMarkTip;
		return;
	}
	const translated = label || lib.translate[skill] || lib.translate[skill + '_bg'] || mark.text.dataset.hhSourceMarkLabel || mark.text.textContent;
	const text = typeof translated === 'string' ? translated.replace(/<[^>]*>/g, '').trim() : '';
	if (!text || text.includes('☯')) return;
	const intros = [info?.intro, mark.info];
	const gold = intros.some(intro => intro && (typeof intro.mark === 'function' || ['expansion', 'card', 'cards'].includes(intro.content) || intro.markcount === 'expansion'));
	mark.classList.toggle('other-skill', gold);
	mark.classList.toggle('own-skill', !gold);
	mark.classList.add('hh-source-mark');
	mark.dataset.hhSourceMark = gold ? 'gold' : 'gray';
	mark.text.dataset.hhSourceMarkLabel = text;
	updateContent(mark);
}

export function refreshSourceSkillMarks(container) {
	if (!container) return;
	const marks = Array.from(container.children).filter(node => node.classList.contains('mark') && !node.classList.contains('removing'));
	syncTips(container, marks);
	for (const mark of marks) if (mark.classList.contains('hh-source-mark')) updateContent(mark);
	// Preserve legacy layout when character portraits, image marks or awakening marks share this container.
	container.classList.toggle('hh-source-marks', marks.length > 0 && marks.every(mark => mark.classList.contains('hh-source-mark')));
}
