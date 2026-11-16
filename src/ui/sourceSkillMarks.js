// Keep the engine's mark nodes, counters and click handlers; only describe their view.
export function decorateSourceSkillMark(mark, lib, { skill = mark.skill || mark.name, label } = {}) {
	const info = lib.skill[skill];
	if (!mark.text || info?.juexingji || info?.limited || info?.zhuanhuanji || info?.zhuanhuanji2 || info?.markimage) {
		mark.classList.remove('hh-source-mark');
		delete mark.dataset.hhSourceMark;
		if (mark.text) delete mark.text.dataset.hhSourceMarkLabel;
		return;
	}
	const translated = label || lib.translate[skill] || lib.translate[skill + '_bg'] || mark.text.dataset.hhSourceMarkLabel || mark.text.textContent;
	const text = typeof translated === 'string' ? translated.replace(/<[^>]*>/g, '').trim() : '';
	if (!text || text.includes('☯')) return;
	mark.classList.add('hh-source-mark');
	mark.dataset.hhSourceMark = mark.classList.contains('other-skill') ? 'gold' : 'gray';
	mark.text.dataset.hhSourceMarkLabel = text;
}

export function refreshSourceSkillMarks(container) {
	if (!container) return;
	const marks = Array.from(container.children).filter(node => node.classList.contains('mark') && !node.classList.contains('removing'));
	// Preserve legacy layout when character portraits, image marks or awakening marks share this container.
	container.classList.toggle('hh-source-marks', marks.length > 0 && marks.every(mark => mark.classList.contains('hh-source-mark')));
}
