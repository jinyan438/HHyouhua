import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistory, readHistory } from '../src/llm/history.js';

test('long archives keep a bounded recent window and aggregated facts without resending full states', () => {
	const records = Array.from({ length: 1000 }, (_, index) => ({ type: 'damage', round: index + 1, player: 'seat:2', num: 1,
		state: { hand: 'OLD_STATE'.repeat(1000) } }));
	records[0] = { type: 'viewCards', cards: [{ name: 'PRIVATELY_SEEN', info: 'effect text'.repeat(1000) }] };
	const result = summarizeHistory(records);
	assert.equal(result.total, 1000); assert.equal(result.summary.through, 984); assert.equal(result.recent.length, 16);
	assert.equal(result.summary.players['seat:2'].damage, 983);
	assert.equal(result.summary.highlights[0].cards[0].name, 'PRIVATELY_SEEN');
	assert.equal(result.recent[0].id, 985); assert.equal(result.recent.at(-1).id, 1000);
	assert.ok(JSON.stringify(result).length < 2500);
	assert.equal(JSON.stringify(result).includes('OLD_STATE'), false);
	assert.equal(records[1].state.hand.length, 9000, 'The complete local archive is preserved');
});

test('history pages recover complete frozen details with stable record ids and filtering', () => {
	const records = Array.from({ length: 25 }, (_, index) => ({ type: index % 2 ? 'damage' : 'recover', player: 'seat:2',
		source: 'seat:3', state: { hp: index } }));
	const page = readHistory(records, { from: 5, limit: 2, player: 'seat:3', type: 'damage' });
	assert.deepEqual(page.records.map(record => record.id), [6, 8]); assert.equal(page.records[0].state.hp, 5); assert.equal(page.next, 9);
	assert.equal(readHistory(records).records[0].id, 18);
	assert.throws(() => readHistory(records, { limit: 9 }), /1 至 8/);
	assert.throws(() => readHistory(records, { from: 0 }), /从 1/);
	assert.deepEqual(readHistory(records, { player: 'seat:4' }).records, []);
});
