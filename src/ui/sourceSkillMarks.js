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
	const count = String(mark.markcount?.textContent ?? '').trim();
	if (mark.hhSourceMarkContent) mark.hhSourceMarkContent.textContent = label + (count ? `[${count}]` : '');
}

export function decorateSourceSkillMark(mark, lib, { skill = mark.skill || mark.name, label } = {}) {
	const info = lib.skill[skill] || lib.skill[mark.skill];
	if (!mark.text || info?.juexingji || info?.limited || info?.zhuanhuanji || info?.zhuanhuanji2 || info?.markimage) {
		mark.classList.remove('hh-source-mark');
		delete mark.dataset.hhSourceMark;
		if (mark.text) delete mark.text.dataset.hhSourceMarkLabel;
		mark.hhSourceMarkContent?.remove();
		delete mark.hhSourceMarkContent;
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
	for (const mark of marks) if (mark.classList.contains('hh-source-mark')) updateContent(mark);
	// Preserve legacy layout when character portraits, image marks or awakening marks share this container.
	container.classList.toggle('hh-source-marks', marks.length > 0 && marks.every(mark => mark.classList.contains('hh-source-mark')));
}
