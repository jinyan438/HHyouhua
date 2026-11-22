import assert from 'node:assert/strict';
import test from 'node:test';
import { getDoudizhuLayout, setupDoudizhuLayout } from '../src/ui/doudizhuLayout.js';

function table() {
	const seats = ['zhu', 'fan', 'fan'].map((identity, index) => ({ identity, dataset: { position: String(index) }, classList: { contains: name => name === 'player' }, cacheLeft: 100 }));
	seats.forEach((player, index) => { player.nextSeat = seats[(index + 1) % 3]; player.next = player.nextSeat; });
	return { seats, game: { players: [seats[2], seats[0], seats[1]], dead: [], zhu: seats[0], me: seats[0] } };
}

test('all three perspectives follow the landlord and the engine seat ring', () => {
	const { seats, game } = table();
	const expected = [['self', 'top-right', 'top-left'], ['top', 'self', 'right'], ['top', 'left', 'self']];
	for (let index = 0; index < 3; index++) {
		game.me = seats[index];
		const layout = getDoudizhuLayout(game, 'doudizhu');
		assert.equal(layout.view, index + 1);
		assert.deepEqual(seats.map(player => layout.slots.get(player)), expected[index]);
		assert.deepEqual(seats.map(player => player.dataset.position), ['0', '1', '2']);
		assert.equal(seats[0].nextSeat, seats[1]);
	}
});

test('a dead farmer keeps their seat and cannot change the surviving farmer perspective', () => {
	const { seats, game } = table();
	game.me = seats[2];
	game.players = [seats[0], seats[2]];
	game.dead = [seats[1]];
	seats[0].next = seats[2]; // Live turn links skip dead players; physical seat links do not.
	const layout = getDoudizhuLayout(game, 'doudizhu');
	assert.equal(layout.view, 3);
	assert.equal(layout.slots.get(seats[1]), 'left');
	assert.equal(layout.slots.get(seats[0]), 'top');
});

test('reconnection can resolve engine positions before physical seat links arrive', () => {
	const { seats, game } = table();
	seats.forEach((player, index) => { delete player.nextSeat; player.dataset.position = String((index + 2) % 3); });
	game.me = seats[1];
	assert.equal(getDoudizhuLayout(game, 'doudizhu').view, 2);
	seats[1].dataset.position = seats[0].dataset.position;
	assert.equal(getDoudizhuLayout(game, 'doudizhu'), null);
});

test('other modes, unsettled bidding and incomplete tables retain their native layout', () => {
	const { game } = table();
	assert.equal(getDoudizhuLayout(game, 'identity'), null);
	assert.equal(getDoudizhuLayout({ ...game, zhu: undefined }, 'doudizhu'), null);
	assert.equal(getDoudizhuLayout({ ...game, players: game.players.slice(1) }, 'doudizhu'), null);
});

test('refresh invalidates animation coordinates, clears stale layouts and follows a replaced arena', t => {
	const previous = globalThis.MutationObserver, observers = [];
	globalThis.MutationObserver = class {
		constructor(callback) { this.callback = callback; observers.push(this); }
		observe(node) { this.node = node; }
		disconnect() { this.disconnected = true; }
	};
	t.after(() => { globalThis.MutationObserver = previous; });
	const { seats, game } = table(), lib = {}, ui = { arena: { children: seats, dataset: {} } };
	let mode = 'doudizhu';
	const controller = setupDoudizhuLayout({ lib, game, ui, get: { mode: () => mode } });
	assert.equal(ui.arena.dataset.hhDoudizhuView, '1');
	seats.forEach(player => { player.cacheLeft = 50; });
	game.me = seats[1]; controller.refresh();
	assert.equal(ui.arena.dataset.hhDoudizhuView, '2');
	assert.ok(seats.every(player => player.cacheLeft === null));
	mode = 'identity'; controller.refresh();
	assert.equal(ui.arena.dataset.hhDoudizhuView, undefined);
	assert.ok(seats.every(player => player.dataset.hhDoudizhuSlot === undefined));
	ui.arena = { children: [], dataset: {} }; controller.observe();
	assert.equal(observers[0].disconnected, true);
	assert.equal(observers[1].node, ui.arena);
	assert.equal(setupDoudizhuLayout({ lib, game, ui, get: { mode: () => mode } }), controller);
	assert.equal(lib.arenaReady.length, 1);
});
