import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { collectBattleRecord, exportBattleReplay } from '../src/ui/battleRecordData.js';
import { collectMvpResult, createMvpSettlement } from '../src/ui/mvpSettlement.js';
import { createBattleRecord } from '../src/ui/battleRecord.js';
import { domFixture } from './helpers/catalog-dom.mjs';

function fixture() {
	const dom = domFixture(), window = new dom.Element('window'), exports = [], lobby = [];
	const a = { playerid: 'a', name: 'zhangmancheng', nickname: '获胜玩家', identity: 'zhu', stat: [{ kill: 1 }, { kill: 1 }], 攻击分数: 156, 治疗分数: 153, 辅助分数: 30, 局势分数: 100,
		getSeatNum: () => 1, getEnemies: () => [b, c], getFriends: () => [], node: { avatar: { style: { backgroundImage: 'url(zhangmancheng.jpg)' } } } };
	const b = { playerid: 'b', name: 'gongsunkang', identity: 'fan', stat: [], 辅助分数: 39, getSeatNum: () => 2, getEnemies: () => [a], getFriends: () => [c] };
	const c = { playerid: 'c', name: 'lvlingqi', nickname: '<不会被解析>', identity: 'fan', stat: [], 辅助分数: 20, getSeatNum: () => 3, getEnemies: () => [a], getFriends: () => [b] };
	const game = { players: [a], dead: [b, c], me: b, roundNumber: 2, checkOnlineResult: player => player.identity === 'zhu',
		playAudio: () => ({ pause() {}, remove() {} }), saveConfig() {}, getVideoName: () => ['公孙康', '斗地主'],
		export: (...args) => exports.push(args), reload() {} };
	const lib = { assetURL: '/', onover: [], skill: {}, video: [{ type: 'init', content: [] }, { type: 'over', content: '战斗失败' }],
		init: { encode: value => Buffer.from(value).toString('base64') }, config: { mode: 'doudizhu', connect_nickname: '红薯' } };
	const get = { mode: () => 'doudizhu', translation: value => ({ doudizhu: '斗地主', zhangmancheng: '张曼成', gongsunkang: '公孙康', lvlingqi: '吕玲绮', zhu2: '地主', fan2: '农民' })[value] || value };
	const context = { lib, game, get, ui: { create: {} }, _status: {} };
	const effects = () => ({ start: () => Promise.resolve(true), stop() {} });
	return { ...dom, window, a, b, c, exports, lobby, context, environment: { ...dom.environment, window, createEffects: effects,
		resultEnvironment: { createEffects: effects }, returnToLobby: () => lobby.push(true) } };
}

test('all original record atlas bytes and untrimmed sprite hashes match their recorded sources', () => {
	const dir = new URL('../assets/battle-record/', import.meta.url), sources = JSON.parse(readFileSync(new URL('sources.json', dir)));
	assert.equal(sources.files.length, 2); assert.equal(sources.sprites.length, 65);
	for (const file of [...sources.files, ...sources.sprites]) {
		const data = readFileSync(new URL(file.file, dir)); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.file);
		if (file.size) { assert.equal(data.readUInt32BE(16), file.size[0]); assert.equal(data.readUInt32BE(20), file.size[1]); }
	}
});

test('record snapshot includes dead teammates, uses mode victory, actual kills and exactly the MVP scoring rule', () => {
	const h = fixture(), before = [h.a, h.b, h.c].map(player => ({ ...player }));
	const record = collectBattleRecord(h.context, false, 139999);
	assert.equal(record.duration, 139); assert.equal(record.rounds, 2); assert.equal(record.modeName, '斗地主');
	assert.deepEqual(record.rows.map(row => row.result), ['win', 'lose', 'lose']);
	assert.equal(record.rows[0].kills, 2); assert.equal(record.rows[0].damage, 15.6); assert.equal(record.rows[0].heal, 15.3); assert.equal(record.rows[0].assist, 3);
	const mvp = collectMvpResult(h.context.game), best = record.rows.find(row => row.mvp);
	assert.equal(best.rating, mvp.rating); assert.equal(best.score, mvp.score); assert.equal(best.id, mvp.player.playerid);
	assert.equal(record.rows[1].name, '红薯'); assert.equal(record.rows[2].name, '<不会被解析>');
	h.a.攻击分数 = 999; assert.equal(record.rows[0].damage, 15.6); assert.ok(Object.isFrozen(record.rows));
	h.a.攻击分数 = before[0].攻击分数; assert.deepEqual([h.a, h.b, h.c], before);
	// Death is independent of a faction's victory.
	h.context.game.me = h.c; h.context.game.checkOnlineResult = () => true;
	assert.ok(collectBattleRecord(h.context, true).rows.every(row => row.result === 'win'));
	assert.ok(collectBattleRecord(h.context, null).rows.every(row => row.result === 'tie'));
});

test('mode helper failure falls back to allies without declaring unclassified players defeated', () => {
	const h = fixture(); h.context.game.checkOnlineResult = () => { throw Error('host only'); };
	const record = collectBattleRecord(h.context, false);
	assert.equal(record.rows.find(row => row.id === 'a').result, 'win'); assert.equal(record.rows.find(row => row.id === 'c').result, 'lose');
	h.context.game.me = null;
	assert.ok(collectBattleRecord(h.context, true).rows.every(row => row.result === 'unknown'));
});

test('record modal restores the underlying settlement, retains local likes and exports a real engine replay', () => {
	const h = fixture(), record = collectBattleRecord(h.context, false, 139000);
	const underlay = h.document.createElement('div'); h.document.body.appendChild(underlay); underlay.focus();
	const view = createBattleRecord(h.context, h.environment); assert.equal(view.show(record, underlay), true); assert.equal(view.show(record, underlay), false);
	let root = h.document.body.querySelector('.hh-battle-record'); assert.equal(underlay.inert, true);
	assert.ok(root.textContent.includes('02:19')); assert.equal(root.querySelectorAll('.hh-record-row').length, 3);
	assert.equal(root.querySelector('.hh-record-best').textContent, '获胜玩家');
	const like = root.querySelector('.hh-record-like'); like.emit('click'); like.emit('click'); assert.equal(like.getAttribute('aria-pressed'), 'true');
	root.querySelector('.hh-record-save').emit('click');
	const video = JSON.parse(Buffer.from(h.exports[0][0], 'base64').toString());
	assert.deepEqual(video.video, h.context.lib.video); assert.equal(video.mode, 'doudizhu'); assert.equal(video.win, false); assert.equal(video.name1, 'gongsunkang');
	root.querySelector('.hh-record-rules-button').emit('click'); assert.ok(root.querySelector('.hh-record-rules'));
	root.emit('keydown', { key: 'Escape' }); assert.equal(root.querySelector('.hh-record-rules'), null); assert.equal(view.active, true);
	root.emit('keydown', { key: 'Escape' }); assert.equal(view.active, false); assert.equal(underlay.getAttribute('aria-hidden'), null); assert.ok(h.document.activeElement === underlay);
	view.show(record, underlay); root = h.document.body.querySelector('.hh-battle-record'); assert.equal(root.querySelector('.hh-record-like').getAttribute('aria-pressed'), 'true');
	root.querySelector('.hh-record-like-all').emit('click'); assert.ok(root.querySelectorAll('.hh-record-like').every(button => button.getAttribute('aria-pressed') === 'true'));
	view.reset(); assert.equal(view.active, false); assert.equal(h.window.listeners.get('resize').length, 0);
	// Prefer the native saved object, including mode-specific character aliases.
	h.context.lib.videos = [{ name: ['模式武将', '国战'], video: h.context.lib.video, mode: 'guozhan', name1: 'mode::custom', win: false, time: 123 }];
	assert.equal(exportBattleReplay(h.context, record), true);
	assert.deepEqual(JSON.parse(Buffer.from(h.exports.at(-1)[0], 'base64').toString()), h.context.lib.videos[0]);
	h.context._status.video = true; assert.equal(exportBattleReplay(h.context, record), false);
});

test('opening records at either settlement stage cannot skip MVP or return early; continue still reaches the lobby once', () => {
	const h = fixture(), settlement = createMvpSettlement(h.context, h.environment);
	settlement.reset(); h.advance(139000); settlement.onover(false);
	const outcome = h.document.body.querySelector('.hh-game-result');
	assert.equal(outcome.querySelector('.hh-result-records').emit('click').stopped, true);
	let records = h.document.body.querySelector('.hh-battle-record'); assert.ok(records.textContent.includes('02:19'));
	outcome.emit('click'); assert.equal(h.document.body.querySelector('.hh-mvp-portrait'), null); assert.equal(h.lobby.length, 0);
	records.emit('click'); assert.ok(outcome.isConnected); h.advance(1800); outcome.emit('click');
	const mvp = h.document.body.querySelector('.hh-mvp-screen'); assert.ok(mvp.querySelector('.hh-mvp-portrait'));
	mvp.querySelector('.hh-result-records').emit('click'); records = h.document.body.querySelector('.hh-battle-record');
	assert.equal(records.querySelector('.hh-record-mvp').getAttribute('aria-label'), `MVP 总评分 ${mvp.querySelector('.hh-mvp-score-value').textContent}`);
	h.advance(1500); mvp.emit('click'); assert.equal(h.lobby.length, 0); records.emit('click'); mvp.emit('click'); mvp.emit('click'); assert.equal(h.lobby.length, 1);
	assert.equal(h.document.body.querySelector('.hh-battle-record'), null);
});
