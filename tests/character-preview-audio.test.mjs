import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacterPreviewAudio } from '../src/ui/characterPreviewAudio.js';
import { createCharacterVoice } from '../src/ui/characterDetail.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
	const dom = domFixture(), requests = [], audio = [];
	const create = dom.document.createElement;
	dom.document.createElement = tag => {
		const element = create(tag);
		if (tag === 'audio') {
			element.paused = true;
			element.play = async () => { element.paused = false; };
			element.pause = () => { element.paused = true; };
			audio.push(element);
		}
		return element;
	};
	const context = {
		lib: { assetURL: '/noname/', config: { volumn_audio: 6, background_speak: true } },
		ui: {},
		game: { playAudio() { assert.fail('大厅不调用依赖 ui.window 的对局音频'); }, async getDB(...args) { requests.push(args); return 'database-blob'; } },
		get: { objectURL: blob => 'blob:' + blob, character: () => ({ sex: 'male' }) },
	};
	return { ...dom, context, audio, requests, playAudio: createCharacterPreviewAudio(context, dom.document) };
}

test('大厅台词无需游戏窗口，支持原生、扩展、数据库及直接音频地址', async () => {
	const h = fixture();
	for (const [path, expected] of [
		['skill/rende1', '/noname/audio/skill/rende1.mp3'],
		['skill/rende2.ogg', '/noname/audio/skill/rende2.ogg'],
		['ext:hh_sp/h_qirang1.mp3', '/noname/extension/hh_sp/h_qirang1.mp3'],
		['db:extension-test/voice.mp3', 'blob:database-blob'],
		['db:extension-test:voice.mp3', 'blob:database-blob'],
		['https://example.test/voice.mp3', 'https://example.test/voice.mp3'],
		['data:audio/mp3;base64,AA==', 'data:audio/mp3;base64,AA=='],
	]) {
		const audio = h.playAudio({ path }); await flush();
		assert.equal(audio.src, expected); assert.equal(audio.volume, .75); assert.equal(audio.autoplay, true);
		await audio.oncanplay(); assert.equal(audio.paused, false);
		audio.onended(); assert.equal(audio.isConnected, false);
	}
	assert.deepEqual(h.requests, [['image', 'extension-test:voice.mp3'], ['image', 'extension-test:voice.mp3']]);
	assert.equal(h.context.ui.window, undefined);
});

test('大厅台词沿用静音和轮播，缺失文件只尝试一次，离开时停止并清理', async () => {
	const h = fixture();
	h.context.get.Audio = { skill: () => ({ audioList: [{ file: 'skill/missing.mp3', text: '第一句' }, { file: 'ext:test/second.mp3', text: '第二句' }] }) };
	const voice = createCharacterVoice(h.context, { playAudio: h.playAudio });
	h.context.lib.config.volumn_audio = 0; assert.equal(voice.play('skill', 'general').muted, true); assert.equal(h.audio.length, 0);
	h.context.lib.config.volumn_audio = 6;
	assert.equal(voice.play('skill', 'general').text, '第一句'); await flush();
	h.audio[0].onerror(); await flush();
	assert.equal(h.audio[0].isConnected, false); assert.equal(h.audio[1].src, '/noname/extension/test/second.mp3');
	h.audio[1].onerror(); assert.equal(h.audio.length, 2); assert.equal(h.audio[1].isConnected, false);
	assert.equal(voice.play('skill', 'general').text, '第二句'); await flush(); await h.audio[2].oncanplay();
	voice.stop(); assert.equal(h.audio[2].paused, true); assert.equal(h.audio[2].isConnected, false);
	h.audio[2].onerror(); assert.equal(h.audio.length, 3);
});

test('关闭台词后异步数据库读取不会恢复播放，读取失败会清理并回退', async () => {
	const h = fixture(); let resolve, failures = 0;
	h.context.game.getDB = () => new Promise(done => { resolve = done; });
	const audio = h.playAudio({ path: 'db:extension-test:voice.mp3', onError() { failures++; } }); await flush();
	audio.pause(); audio.remove(); resolve('late-blob'); await flush();
	assert.equal(audio.src, undefined); assert.equal(audio.isConnected, false); assert.equal(failures, 0);
	h.context.game.getDB = async () => { throw new Error('missing asset'); };
	const failed = h.playAudio({ path: 'db:extension-test:missing.mp3', onError() { failures++; } }); await flush();
	assert.equal(failures, 1); assert.equal(failed.isConnected, false);
});
