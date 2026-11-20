import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateSourceRevealDialog, getSourceRevealOwner } from '../src/ui/sourceReveal.js';
import { domFixture } from './helpers/catalog-dom.mjs';

function fixture() {
	const { document, Element } = domFixture(), after = [], handlers = [], listeners = new Set();
	document.defaultView = { addEventListener(type, fn) { listeners.add(fn); }, removeEventListener(type, fn) { listeners.delete(fn); } };
	const arena = new Element(); arena.clientWidth = 1000; arena.clientHeight = 650; document.body.appendChild(arena);
	const owner = { name: 'oljizhan', insertAfter(fn) { after.push(fn); } };
	const context = { ui: { arena, thrown: [] }, lib: { config: { animation: false }, skill: { oljizhan: {}, luoshen: {} } }, game: {}, _status: {}, get: { position: card => card.pos || 'o', owner: card => card.owner, translation: () => '吉占' } };
	function reveal(number, options = {}) {
		const card = { number }, node = new Element(); node.className = 'button card'; node.link = card;
		const dialog = new Element(); dialog.buttons = [node]; dialog.appendChild(node);
		const event = { name: 'showCards', cards: [card], parent: owner, ...options };
		const decorated = decorateSourceRevealDialog(dialog, event, context);
		return { node, card, dialog, event, decorated };
	}
	return { context, owner, reveal, after, handlers, listeners, Element };
}

test('repeated public reveals retain the same card row until their skill completes', async () => {
	const h = fixture(), first = h.reveal(1), second = h.reveal(2), third = h.reveal(13);
	assert.equal(h.after.length, 1);
	assert.deepEqual(h.context.ui.arena.children, [first.node, second.node, third.node]);
	assert.ok(first.node.tx < second.node.tx && second.node.tx < third.node.tx);
	for (const entry of [first, second, third]) {
		assert.equal(entry.decorated, true); assert.equal(entry.card.clone, entry.node);
		assert.equal(entry.node.fixed, true); assert.equal(entry.node.querySelector('.used-info').textContent, '吉占展示');
		assert.equal(entry.dialog.classList.contains('hh-source-reveal-dialog'), true);
	}
	await h.after[0]();
	assert.equal(h.context.ui.arena.children.length, 0); assert.equal(h.listeners.size, 0);
	assert.equal(first.node.fixed, undefined);
});

test('hidden cards, hand reveals, custom windows, replays and online play keep native presentation', () => {
	for (const props of [{ hiddencards: [{}] }, { customButton() {} }, { createDialog: [] }, { dialog: 1 }, { flashAnimation: true }]) {
		const h = fixture(), shown = h.reveal(8, props); assert.equal(shown.decorated, false); assert.equal(h.after.length, 0);
	}
	for (const key of ['connectMode', 'video']) { const h = fixture(); h.context._status[key] = true; assert.equal(h.reveal(8).decorated, false); }
	const h = fixture(); h.context.get.position = () => 'h'; assert.equal(h.reveal(8).decorated, false);
});

test('revealing the same card again retains its first position and a single visible clone', () => {
	const h = fixture(), first = h.reveal(1), second = h.reveal(2);
	const node = new h.Element(); node.link = first.card;
	const dialog = new h.Element(); dialog.buttons = [node]; dialog.appendChild(node);
	assert.equal(decorateSourceRevealDialog(dialog, { name: 'showCards', cards: [first.card], parent: h.owner }, h.context), true);
	assert.deepEqual(h.context.ui.arena.children, [first.node, second.node]);
	assert.equal(first.card.clone, first.node); assert.equal(node.parentNode, null);
});

test('nested skills hide and restore the outer row and game over releases all fixed clones', async () => {
	const h = fixture(), outer = h.reveal(1);
	const after = [], inner = { name: 'luoshen', parent: h.owner, insertAfter(fn) { after.push(fn); } };
	const second = h.reveal(2, { parent: inner });
	assert.equal(outer.node.style.visibility, 'hidden'); assert.equal(second.node.style.visibility, '');
	await after[0](); assert.equal(outer.node.style.visibility, ''); assert.equal(second.node.parentNode, null);
	h.context.lib.onover.forEach(fn => fn());
	assert.equal(outer.node.parentNode, null); assert.equal(h.listeners.size, 0);
});

test('rejudging replaces its own card without dropping another reveal or changing rule results', async () => {
	const h = fixture(), first = h.reveal(1), original = { number: 6 }, replacement = { number: 9 };
	const node = new h.Element(), finalNode = new h.Element(), dialog = new h.Element();
	replacement.clone = finalNode; const player = { judging: [original] };
	const event = { name: 'judge', node, player, parent: h.owner, pushHandler(fn) { h.handlers.push(fn); } };
	assert.equal(decorateSourceRevealDialog(dialog, event, h.context), true);
	const later = h.reveal(13); player.judging[0] = replacement;
	h.handlers[0](event, { state: 'end' });
	assert.deepEqual(h.context.ui.arena.children.filter(n => n.parentNode), [first.node, later.node, finalNode]);
	assert.ok(finalNode.tx < later.node.tx); assert.equal(event.result, undefined);
	assert.equal(node.parentNode, null); assert.equal(node.fixed, undefined);
	await h.after[0](); assert.equal(finalNode.parentNode, null);
});

test('ownership stops at unrelated card/phase boundaries and tolerates cyclic parents', () => {
	const lib = { skill: { oljizhan: {} } }, parent = { name: 'oljizhan' };
	assert.equal(getSourceRevealOwner({ parent: { name: 'helper', parent } }, lib), parent);
	assert.equal(getSourceRevealOwner({ parent: { name: 'chooseToUse', parent } }, lib), null);
	const cycle = { name: 'helper' }; cycle.parent = cycle;
	assert.equal(getSourceRevealOwner({ parent: cycle }, lib), null);
});
