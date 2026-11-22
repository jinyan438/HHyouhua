// OL OtherSeatTopManager.ShowOtherSeatDistance; see docs/target-distance.md.
export function setupTargetDistance({ lib, game, ui, get, _status }) {
	if (game.hhTargetDistance) return game.hhTargetDistance;
	const visible = new Set();
	let current;
	function remove(target) {
		target._distanceDisplay?.remove();
		delete target._distanceDisplay;
		visible.delete(target);
	}
	function clear() {
		for (const target of visible) remove(target);
		current = undefined;
	}
	function isChoosing(event) {
		return !!event?.player && !!event.filterTarget && event.isMine?.() && !event.finished
			&& !_status.auto && !_status.video && !_status.over && get.select(event.selectTarget)[1] > 0;
	}
	function begin(event) {
		if (event !== current || !isChoosing(event)) clear();
	}
	function update(target, event) {
		if (!isChoosing(event) || target === event.player || target.parentNode !== ui.arena
			|| target.isDead?.() || target.isOut?.() || target.removed || target.hasSkill?.('undist')
			|| event.player.hasSkill?.('undist')) return remove(target);
		const distance = get.distance(event.player, target);
		if (!Number.isFinite(distance)) return remove(target);
		current = event;
		let label = target._distanceDisplay;
		if (!label) {
			label = target.ownerDocument.createElement('div');
			label.className = 'hh-target-distance';
			target.appendChild(label);
			target._distanceDisplay = label;
		}
		label.textContent = '距离' + Math.max(1, distance);
		// A missing hand/equip/judge card is not a distance failure. Native range
		// checks also account for weapons, skill mods and virtual cards.
		const card = event.name === 'chooseToUse' ? get.card() : null;
		const allowed = target.classList.contains('selectable') || target.classList.contains('selected');
		const outOfRange = !allowed && !event.nodistance && card && get.info(card)
			&& lib.filter.targetInRange(card, event.player, target) === false;
		label.classList.toggle('hh-distance-out-of-range', !!outOfRange);
		visible.add(target);
	}
	lib.hooks.checkBegin.push(begin);
	lib.hooks.checkTarget.push(update);
	lib.hooks.uncheckTarget.push(remove);
	lib.onover.push(clear);
	return game.hhTargetDistance = { clear };
}
