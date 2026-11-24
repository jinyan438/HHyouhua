import { bindSelectionCardInput } from './selectionCardInput.js';

// SelectCountryWarGeneralWindow (Sws/dRs): two ordered slots, a horizontal row,
// 300ms sine-out card movement and explicit confirmation. The native event owns
// all candidates, pair restrictions, AI fallback and the resulting main/vice order.
export function createGuozhanSelection({ lib, game, ui, get, _status }, { root, dialog, event, listen, later, cancel, isCurrent, paintCard, onInspect, onClear }) {
	const make = (tag, cls, host = root) => {
		const node = document.createElement(tag); node.className = cls;
		if (tag === 'button') node.type = 'button';
		host.appendChild(node); return node;
	};
	const previews = make('div', 'hh-guozhan-previews');
	const slots = ['主将', '副将'].map((name, index) => {
		const node = make('div', 'hh-guozhan-slot', previews);
		const label = make('span', 'hh-guozhan-slot-label', node); label.textContent = name;
		const slot = { node, button: null, card: null, animation: null };
		node.dataset.slot = String(index);
		return slot;
	});
	const confirm = make('button', 'hh-guozhan-confirm'); confirm.textContent = '确定';
	const prompt = root.querySelector('.hh-selection-prompt');
	const progress = root.querySelector('.hh-selection-progress'); progress.firstChild.style.width = '100%';
	let disposed = false, submitted = false, validPair = false, remaining = Number(event.timeout) * 1000, lastTime = Date.now();
	// A full pair must remain editable until the separate Confirm button is used.
	const forceAuto = event.forceAuto, complexSelect = event.complexSelect;
	event.forceAuto = false; event.complexSelect = true;
	const nativeFilter = event.filterButton;
	const slotFilter = function (button, ...args) {
		// When only the vice slot is occupied, test a new main in main/vice order.
		// This matters for native asymmetric pairs such as a wild main general.
		if (!slots[0].button && slots[1].button && ui.selected.buttons.includes(slots[1].button) && dialog.buttons.includes(slots[1].button) && button !== slots[1].button) {
			const saved = [...ui.selected.buttons];
			ui.selected.buttons.splice(0, ui.selected.buttons.length, button);
			try { return nativeFilter.call(this, slots[1].button, ...args); }
			finally { ui.selected.buttons.splice(0, ui.selected.buttons.length, ...saved); }
		}
		return nativeFilter.call(this, button, ...args);
	};
	event.filterButton = slotFilter;
	const selected = () => ui.selected.buttons.filter(button => dialog.buttons.includes(button));
	const ordered = () => slots.map(slot => slot.button).filter(Boolean);
	const fullPair = () => slots.every(slot => slot.button && ui.selected.buttons.includes(slot.button) && dialog.buttons.includes(slot.button));
	const complete = () => fullPair() && validPair;
	// Native filters also add perfect-pair captions. Evaluate them only during
	// checks/input, never in the DOM observer's paint path (which would loop).
	const revalidate = () => { validPair = fullPair() && nativeFilter.call(event, slots[1].button, game.me); };
	function move(card, from, to) {
		if (lib.config.animation === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !card.animate) return null;
		const scale = root.getBoundingClientRect().width / 2760 || 1;
		return card.animate([
			{ translate: `${(from.left - to.left) / scale}px ${(from.top - to.top) / scale}px` },
			{ translate: '0 0' },
		], { duration: 300, easing: 'cubic-bezier(.39,.575,.565,1)' });
	}
	function writeSelection() {
		const buttons = ordered();
		for (const button of selected()) if (!buttons.includes(button)) { ui.selected.buttons.remove(button); button.classList.remove('selected'); }
		// Preserve the engine's array object and its helper methods.
		ui.selected.buttons.splice(0, ui.selected.buttons.length, ...buttons);
		for (const button of buttons) button.classList.add('selected');
		delete event._buttonChoice;
		revalidate(); const ok = game.check(); validPair = validPair && ok; update(); return ok;
	}
	function choose(button) {
		if (disposed || submitted || !isCurrent() || !dialog.buttons.includes(button)) return;
		const occupied = slots.find(slot => slot.button === button);
		if (occupied) {
			occupied.animation?.cancel();
			const card = occupied.card;
			const from = card?.getBoundingClientRect();
			occupied.button = null; occupied.card = null; card?.remove();
			writeSelection(); onClear();
			if (from) occupied.animation = move(button, from, button.getBoundingClientRect());
			return;
		}
		// Disabled cards still explain their skills, as in the source client.
		if (!button.classList.contains('selectable') || button.classList.contains('unselectable') || !event.filterButton.call(event, button, game.me)) { onInspect(button); return; }
		const slot = slots.find(slot => !slot.button);
		if (!slot) { onInspect(button); return; }
		const from = button.getBoundingClientRect(); slot.button = button;
		writeSelection();
		slot.animation?.cancel(); slot.animation = move(slot.card, from, slot.card.getBoundingClientRect());
		onInspect(button);
	}
	function update() {
		if (disposed) return;
		const chosen = selected();
		for (const slot of slots) {
			if (slot.button && !chosen.includes(slot.button)) slot.button = null;
		}
		for (const button of chosen) if (!slots.some(slot => slot.button === button)) {
			const empty = slots.find(slot => !slot.button); if (empty) empty.button = button;
		}
		for (const slot of slots) {
			if (slot.card?.link !== slot.button?.link) {
				slot.animation?.cancel(); slot.card?.remove(); slot.card = null;
				if (slot.button) {
					const card = ui.create.button(slot.button.link, 'character', slot.node, true);
					card.classList.add('hh-general', 'hh-guozhan-preview'); card.tabIndex = 0; card.setAttribute('role', 'button');
					card.setAttribute('aria-label', `${get.translation(card.link)}，点击退回候选`);
					paintCard(card, true); slot.card = card;
					// The original candidate stays in its native row for rerolls and filters.
					bindSelectionCardInput(card, { listen, later, cancel, activate: () => choose(slot.button) });
				}
			}
			slot.node.classList.toggle('hh-guozhan-filled', !!slot.button);
		}
		for (const button of dialog.buttons) {
			button.classList.toggle('hh-guozhan-picked', chosen.includes(button));
			button.setAttribute('aria-pressed', String(chosen.includes(button)));
		}
		confirm.disabled = submitted || !complete();
		const text = _status.separatism ? '请选择两名武将' : '请选择势力相同的武将';
		if (prompt.textContent !== text) prompt.textContent = text;
	}
	function submit() {
		if (disposed || submitted || !isCurrent() || !complete()) return;
		if (!writeSelection() || !complete() || !isCurrent()) return;
		submitted = true; confirm.disabled = true; onClear(); ui.click.ok();
	}
	listen(confirm, 'click', e => { e.stopPropagation(); submit(); });
	listen(confirm, 'touchend', e => { e.preventDefault(); e.stopImmediatePropagation(); submit(); }, true);
	// Native rerolls and uncheck/check update the slots and pair shading as well.
	const add = event.custom?.add, nativeAdd = add?.button;
	const afterCheck = function (...args) { nativeAdd?.apply(this, args); revalidate(); update(); };
	if (add) add.button = afterCheck;
	function countdown() {
		if (disposed || !(remaining > 0)) return;
		const now = Date.now();
		if (!_status.paused2 && !document.hidden && isCurrent()) remaining -= now - lastTime;
		lastTime = now;
		progress.firstChild.style.width = `${Math.max(0, remaining / (event.timeout * 1000)) * 100}%`;
		if (remaining <= 0 && isCurrent()) { if (complete()) submit(); else { event.result = 'ai'; game.resume(); } }
		else later(countdown, 100);
	}
	if (remaining > 0) later(countdown, 100);
	return { choose, update, dispose() {
		disposed = true;
		for (const slot of slots) slot.animation?.cancel();
		for (const button of dialog.buttons) button.classList.remove('hh-guozhan-picked');
		if (add?.button === afterCheck) { if (nativeAdd === undefined) delete add.button; else add.button = nativeAdd; }
		if (event.filterButton === slotFilter) event.filterButton = nativeFilter;
		if (forceAuto === undefined) delete event.forceAuto; else event.forceAuto = forceAuto;
		if (complexSelect === undefined) delete event.complexSelect; else event.complexSelect = complexSelect;
	} };
}
