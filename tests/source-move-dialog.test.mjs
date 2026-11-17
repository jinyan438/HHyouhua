import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {getSourceMoveLayout, getSourceMoveTitle, decorateSourceMoveDialog, closeSourceMoveDialog} from '../src/ui/sourceMoveDialog.js';

test('move boards fit landscape and portrait arenas and keep all rows inside the panel',()=>{
	for(const [width,height] of [[1366,768],[844,390],[390,844],[320,568]]){
		for(const rows of [1,2,3]){
			const s=getSourceMoveLayout(width,height,rows,5);
			assert.ok(s.board<=width);
			assert.ok(s.scale>=.42&&s.scale<=1);
			assert.ok(s.panelHeight>=s.bodyHeight+44);
			assert.ok(s.contentTop>=44);
			assert.ok(s.panelHeight-s.contentTop-s.bodyHeight>=16);
			assert.ok(Math.abs(s.cardWidth/s.cardHeight-108/150)<1e-10);
			assert.ok(s.top+s.panelHeight<height);
		}
	}
});

test('titles use the real skill name and preserve plain labels for non-skill sorting',()=>{
	const lib={skill:{guanxing:{},xunxun:{}}},get={translation:id=>({guanxing:'观星',xunxun:'恂恂'})[id]||id};
	assert.equal(getSourceMoveTitle({name:'chooseToMove',parent:{name:'guanxing'}},get,lib),'观星');
	assert.equal(getSourceMoveTitle({name:'chooseToMove',prompt:'自若：请整理手牌顺序'},get,lib),'自若');
	assert.equal(getSourceMoveTitle({name:'chooseToMove',prompt:'点击或拖动将牌移动到牌堆顶或牌堆底',list:[['牌堆顶',[]],['牌堆底']]},get,lib),'观星');
	const event={name:'chooseToMove',skill:'xunxun'};event.parent=event;
	assert.equal(getSourceMoveTitle(event,get,lib),'恂恂');
});

test('ordinary dialogs and a different event dialog are left untouched',()=>{
	const dialog={};
	assert.equal(decorateSourceMoveDialog(dialog,{name:'chooseButton',dialog},{}),false);
	assert.equal(decorateSourceMoveDialog(dialog,{name:'chooseToMove',dialog:{}},{}),false);
	assert.doesNotThrow(()=>closeSourceMoveDialog(dialog));
});

test('native panel, row labels and empty slots retain their source hashes and the last loading style uses the same panel',()=>{
	const root=new URL('../assets/move-dialog/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL('sources.json',root),'utf8'));
	for(const record of [...config.files,...config.derived]){
		const bytes=fs.readFileSync(new URL(record.file,root));
		assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
		assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],record.size);
	}
	assert.ok(fs.readFileSync(new URL('panel.png',root)).equals(fs.readFileSync(new URL('../image/ui/dialog/dialog5.png',import.meta.url))));
	assert.equal(config.loadingStyle.value,'onlineUI');
});
