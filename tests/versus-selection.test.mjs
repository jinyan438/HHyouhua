import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { selectionFixture } from './helpers/selection-dom.mjs';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo } from '../src/effects/killCombo.js';

function fixture(options = {}) {
	const h = selectionFixture({ mode: 'versus', count: 12, ...options });
	h.game.players.push({ identity: 'fan' });
	h.game.players.forEach((player, index) => { player.side = index < 2; });
	h._status.firstAct = h.game.players[0];
	h.get.distance = (a, b) => (h.game.players.indexOf(b) - h.game.players.indexOf(a) + 4) % 4;
	h._status.mode = 'two';
	h.parent.list = Object.keys(h.lib.character);
	h.parent.finish = () => {};
	h.game.players.forEach(player => { player.init = function (id, second) { this.name1 = id; this.name2 = second; return this; }; });
	return h;
}

test('native recommend entry preserves self preview, reserves the general and supplies it to the AI init', () => {
	const h = fixture(), mate = h.game.players[1], nativeInit = mate.init, root = h.open();
	const own = h.dialog.buttons[0], recommended = h.dialog.buttons[1], entry = root.querySelector('.hh-versus-recommend');
	assert.equal(entry.hidden, false);
	own.emit('click'); entry.emit('click');
	assert.ok(root.classList.contains('hh-versus-recommending'));
	recommended.emit('click');
	assert.equal(h.calls.ok, 0); assert.equal(h.ui.selected.buttons.length, 0);
	assert.equal(root.querySelector('.hh-versus-self')._hhButton, own);
	assert.equal(root.querySelector('.hh-versus-mate')._hhButton, recommended);
	assert.equal(h.parent._hhVersusRecommendation.current.id, recommended.link);
	assert.ok(!h.parent.list.includes(recommended.link));
	own.emit('click'); h.dialog.close();
	const fallback = h.parent.list.pop();
	assert.equal(mate.init(fallback), mate); assert.equal(mate.name1, recommended.link);
	assert.ok(h.parent.list.includes(fallback));
	h.parent.finish(); assert.equal(mate.init, nativeInit); assert.equal(h.parent._hhVersusRecommendation, undefined);
});

test('recommendations can be changed and are invalidated by reroll, seat changes and own confirmed choice', () => {
	const h = fixture({ select: 2 }), root = h.open(), [own, first, second] = h.dialog.buttons;
	const entry = root.querySelector('.hh-versus-recommend'), controller = h.parent._hhVersusRecommendation;
	entry.emit('click'); first.emit('click'); entry.emit('click'); entry.emit('click'); second.emit('click');
	assert.ok(h.parent.list.includes(first.link)); assert.equal(controller.current.id, second.link);
	second.emit('click'); second.emit('click'); assert.equal(controller.current, null);
	assert.ok(h.parent.list.includes(second.link));
	entry.emit('click'); first.emit('click');
	h.dialog.buttons.splice(h.dialog.buttons.indexOf(first), 1);
	h.observers[1].callback(); assert.equal(controller.current, null); assert.ok(h.parent.list.includes(first.link));
	entry.emit('click'); own.emit('click');
	h.game.players[1].side = false; h.game.players[2].side = true;
	h.observers[1].callback(); assert.equal(controller.current, null);
	h.dialog.close(); h.parent.finish();
});

test('recommend entry cancels and reopens with mouse, touch and keyboard, restoring the pool and labels', () => {
	for (const activate of [node => node.emit('click'), node => { node.emit('touchend'); node.emit('click'); }, node => node.emit('keydown', { key: 'Enter' })]) {
		const h = fixture({ select: 2 }), pool = [...h.parent.list], root = h.open();
		const [own, pending, recommended] = h.dialog.buttons;
		const entry = root.querySelector('.hh-versus-recommend'), controller = h.parent._hhVersusRecommendation;
		own.emit('click'); own.emit('click'); pending.emit('click');
		for (let repeat = 0; repeat < 2; repeat++) {
			activate(entry); activate(recommended);
			assert.equal(controller.current.id, recommended.link);
			assert.equal(recommended.querySelector('.hh-card-confirm').textContent, '推荐选择');
			assert.equal(entry.getAttribute('aria-pressed'), 'true');
			assert.equal(root.classList.contains('hh-versus-recommending'), false);
			h.observers[1].callback();
			assert.equal(recommended.querySelector('.hh-card-confirm').textContent, '推荐选择');
			activate(entry);
			assert.equal(controller.current, null);
			assert.deepEqual(h.parent.list, pool);
			assert.equal(root.classList.contains('hh-versus-recommending'), false);
			assert.equal(entry.getAttribute('aria-pressed'), 'false');
			assert.equal(root.querySelector('.hh-versus-recommend-portrait').style.backgroundImage, '');
			assert.equal(root.querySelector('.hh-versus-mate')._hhButton, null);
			assert.equal(recommended.classList.contains('hh-versus-recommended'), false);
			assert.equal(recommended.querySelector('.hh-card-confirm').textContent, '确认选择');
			assert.equal(own.querySelector('.hh-card-confirm').textContent, '已选择');
			assert.equal(pending.querySelector('.hh-card-confirm').textContent, '确认选择');
			assert.equal(root.querySelector('.hh-versus-self')._hhButton, pending);
			assert.deepEqual([...h.ui.selected.buttons], [own]);
			assert.equal(h.calls.ok, 0);
		}
		h.game.players[1].init('general20');
		assert.equal(h.game.players[1].name1, 'general20');
		h.dialog.close(); h.parent.finish();
	}
});

test('recommendation does not override human seats, team assignment, unavailable generals or later games', () => {
	for (const setup of [h => { h.parent.two_assign = true; }]) {
		const h = fixture(); setup(h); const root = h.open();
		assert.equal(root.querySelector('.hh-versus-recommend').hidden, true);
		h.dialog.close(); h.parent.finish();
	}
	const h = fixture(), root = h.open(), controller = h.parent._hhVersusRecommendation, mate = h.game.players[1];
	assert.equal(controller.recommend('missing'), false);
	mate.isOnline = () => true;
	assert.equal(root.querySelector('.hh-versus-recommend').hidden, false);
	assert.equal(controller.recommend(h.dialog.buttons[1].link), true);
	assert.ok(h.parent.list.includes(h.dialog.buttons[1].link));
	const fallback = h.parent.list.pop(); mate.init(fallback);
	assert.equal(mate.name1, fallback); assert.equal(controller.current, null);
	h.parent.finish(); h.dialog.close();
	delete mate.name1; mate.init('general20'); assert.equal(mate.name1, 'general20');
});

test('native free selection of the recommended general as own reserve cancels the AI recommendation', () => {
	const h = fixture({ select: 2 }), root = h.open(), controller = h.parent._hhVersusRecommendation;
	controller.recommend('general1'); h.event.result = { links: ['general0', 'general1'] };
	h.game.me.init('general0'); h.game.me.replacetwo = 'general1';
	const mate = h.game.players[1]; mate.init('general20');
	assert.equal(mate.name1, 'general20'); assert.equal(controller.current, null);
	h.parent.finish(); h.dialog.close();
});

test('versus retains the exact native candidates, previews before submission and confirms from the large card', () => {
	const h = fixture(), original = [...h.dialog.buttons], root = h.open();
	assert.ok(root.classList.contains('hh-versus-selection'));
	assert.deepEqual(h.dialog.buttons, original);
	assert.equal(root.querySelectorAll('.hh-versus-name').length, 12);
	assert.equal(root.querySelectorAll('.hh-seat').length, 4);
	assert.equal(root.querySelectorAll('.hh-seat-enemy').length, 2);
	assert.equal(root.querySelector('.hh-point-slot'), null);
	assert.ok(h.dialog.buttons.every(button => button.querySelector('.hh-general-swap').hidden));
	h.dialog.buttons[0].emit('click');
	assert.equal(h.calls.ok, 0); assert.equal(h.ui.selected.buttons.length, 0);
	assert.equal(root.querySelector('.hh-versus-self')._hhButton, original[0]);
	root.querySelector('.hh-versus-self').emit('click');
	assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons[0], original[0]);
	h.dialog.close();
	assert.equal(h.dialog._hhSelection, undefined); assert.equal(h.timers.size, 0);
	assert.ok(h.observers.every(observer => observer.disconnected));
});

test('team assignment with reserves keeps self, self reserve, teammate, teammate reserve result order', () => {
	const h = fixture({ select: 4 }); h.parent.two_assign = true; h._status.replacetwo = true;
	const root = h.open(), buttons = h.dialog.buttons.slice(0, 4);
	buttons[0].emit('click'); buttons[0].emit('click');
	assert.equal(h.calls.ok, 0); assert.match(root.querySelector('.hh-selection-prompt').textContent, /我方替补/);
	buttons[1].emit('click'); buttons[1].emit('click');
	assert.match(root.querySelector('.hh-selection-prompt').textContent, /队友武将/);
	buttons[2].emit('click');
	assert.equal(root.querySelector('.hh-versus-mate')._hhButton, buttons[2]);
	buttons[2].emit('click'); assert.match(root.querySelector('.hh-selection-prompt').textContent, /队友替补/);
	buttons[3].emit('click'); buttons[3].emit('click');
	assert.equal(h.calls.ok, 1); assert.deepEqual([...h.ui.selected.buttons], buttons);
	h.dialog.close();
});

test('versus rejects reserved and unselectable candidates and preserves the mode filter', () => {
	const h = fixture({ fixed: true, teammate: true }); const filter = h.event.filterButton, root = h.open();
	const reserved = h.dialog.buttons.at(-1); reserved.emit('click'); reserved.emit('click');
	assert.equal(h.calls.ok, 0); assert.equal(root.querySelector('.hh-skill-panel'), null);
	const used = h.dialog.buttons[0]; used.classList.add('unselectable'); used.emit('click'); used.emit('click');
	assert.equal(h.calls.ok, 0); assert.equal(root.querySelector('.hh-skill-panel'), null);
	h.dialog.close(); assert.equal(h.event.filterButton, filter);
});

test('seat shortcuts invoke the actual native touch or mouse seat event', () => {
	for (const touchscreen of [false, true]) {
		const h = fixture(); h.lib.config.touchscreen = touchscreen; let invoked = '';
		const settings = h.document.createElement('div'); settings.className = 'add-setting';
		const nativeSeat = h.document.createElement('div'); nativeSeat.className = 'tdnode';
		nativeSeat.click = () => { invoked = 'click'; }; nativeSeat.dispatchEvent = e => { invoked = e.type; };
		settings.appendChild(nativeSeat); h.dialog.content.appendChild(settings);
		const root = h.open(); root.querySelector('.hh-seat').emit('click');
		assert.equal(invoked, touchscreen ? 'touchend' : 'click'); h.dialog.close();
	}
});

test('original textures and three Spine tracks are intact and decode in the isolated 4.0 runtime', () => {
	const root = new URL('../assets/versus-selection/', import.meta.url);
	const source = JSON.parse(fs.readFileSync(new URL('sources.json', root), 'utf8'));
	for (const file of source.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, root))).digest('hex'), file.sha256, file.file);
	const bytes = name => fs.readFileSync(new URL('OL_PaiJu_Xuanjiang.' + name, root));
	for (const action of ['play', 'play2', 'play3']) {
		const model = decodeKillCombo(spine, { action }, bytes('atlas.txt').toString('utf8'), bytes('skel'), { 'OL_PaiJu_Xuanjiang.png': { width: 2048, height: 1024 } });
		assert.equal(model.data.version, '4.0.56'); assert.ok(model.animation.duration > 0);
	}
});


test('other versus modes preserve native dialogs, candidates, controls and player initialization', () => {
	for (const mode of ['standard', 'three', 'four', 'jiange', 'siguo', 'guandu', 'endless', 'one']) {
		const nativeDouble = () => ({ native: true });
		const h = fixture({ setup({ game }) { game.chooseCharacterDouble = nativeDouble; } });
		h._status.mode = mode;
		const filter = h.event.filterButton, init = h.game.players[1].init, controls = h.ui.control.parentNode;
		assert.equal(h.open(), undefined, mode);
		assert.equal(h.event.filterButton, filter);
		assert.equal(h.game.players[1].init, init);
		assert.equal(h.parent._hhVersusRecommendation, undefined);
		assert.equal(h.ui.control.parentNode, controls);
		assert.equal(h.game.chooseCharacterDouble, nativeDouble);
		h._status.event = h.parent;
		const ids = h.parent.list.slice(0, 7);
		assert.deepEqual(h.ui.create.buttons(ids, 'characterx').map(button => button.link), ids);
		h.event.name = 'chooseCharacter'; h._status.event = h.event;
		h.dialog.open(); assert.equal(h.dialog._hhSelection, undefined);
	}
});

test('Happy initial deals and native rerolls offer twelve real candidates without changing the pool', () => {
	const h = fixture(), pool = [...h.parent.list], deal = pool.slice(0, 7);
	h._status.event = h.parent;
	const first = h.ui.create.buttons(deal, 'characterx');
	assert.equal(first.length, 12);
	assert.equal(new Set(first.map(button => button.link)).size, 12);
	assert.deepEqual(Array.from(first.slice(0, 7), button => button.link), deal);
	assert.ok(first.every(button => pool.includes(button.link)));
	assert.deepEqual(h.parent.list, pool); assert.equal(deal.length, 7);
	h._status.event = h.event; h.open();
	const rerolled = h.ui.create.buttons(pool.slice(7, 14), 'characterx');
	assert.equal(rerolled.length, 12);
	assert.deepEqual(h.parent.list, pool);
	h.dialog.close(); h.parent.finish();
});

test('Happy expansion respects legal, occupied and same-source generals and a short pool', () => {
	const h = fixture(); h._status.event = h.parent;
	h.parent.list = Object.keys(h.lib.character).slice(0, 16);
	h.get.sourceCharacter = id => ['general7', 'general8'].includes(id) ? 'same' : id;
	h.lib.filter.characterDisabled = id => ['general9', 'general10'].includes(id);
	h.game.players[2].name1 = 'general11'; h.game.players[2].replacetwo = 'general12';
	const ids = h.ui.create.buttons(h.parent.list.slice(0, 7), 'characterx').map(button => button.link);
	assert.equal(ids.length, 11);
	assert.equal(new Set(ids.map(h.get.sourceCharacter)).size, ids.length);
	assert.ok(['general9', 'general10', 'general11', 'general12'].every(id => !ids.includes(id)));
	h.parent.list = ['general0', 'general1', 'general2'];
	assert.equal(h.ui.create.buttons(h.parent.list, 'characterx').length, 3);
});

test('free catalogs, unrelated dialogs, online and brawl selections retain their native candidate counts', () => {
	const h = fixture(), ids = h.parent.list.slice(0, 7);
	h._status.event = h.parent;
	assert.equal(h.ui.create.buttons(ids, 'character').length, 7);
	assert.equal(h.ui.create.buttons(h.parent.list, 'characterx').length, 40);
	h._status.event = h.event;
	assert.equal(h.ui.create.buttons(ids, 'characterx').length, 7);
	h.parent.dialogxx = h.dialog;
	assert.equal(h.open(), undefined);
	assert.equal(h.ui.create.buttons(ids, 'characterx').length, 7);
	delete h.parent.dialogxx;
	for (const [object, key] of [[h._status, 'connectMode'], [h.game, 'online'], [h._status, 'brawl']]) {
		object[key] = true; h._status.event = h.parent;
		assert.equal(h.ui.create.buttons(ids, 'characterx').length, 7);
		h._status.event = h.event;
		assert.equal(h.open(), undefined);
		assert.equal(h.parent._hhVersusRecommendation, undefined);
		delete object[key];
	}
});
