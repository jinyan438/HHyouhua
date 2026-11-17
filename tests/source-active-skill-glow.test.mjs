import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {updateSkillUsability} from '../ui/skill/skins/gskillMixin.js';

function button(id) {
	const classes=new Set();
	return {dataset:{id},classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name);},contains(name){return classes.has(name);}}};
}

test('only active skill definitions receive the source effect, including response and limited skills',()=>{
	const nodes=['active','response','limited','passive','locked'].map(button);
	const lib={skill:{active:{enable:'phaseUse'},response:{enable:['chooseToUse','chooseToRespond']},limited:{enable:'phaseUse',limited:true},passive:{trigger:{player:'damageEnd'}},locked:{locked:true}}};
	const context={lib,game:{me:{}},ui:{},get:{is:{locked:id=>id==='locked'}},ai:{},_status:{event:{skill:'response'}}};
	updateSkillUsability(nodes,nodes.map(n=>n.dataset.id),context);
	for(const node of nodes){
		assert.equal(node.classList.contains('hh-source-active-skill'),['active','response','limited'].includes(node.dataset.id));
	}
	assert.equal(nodes[1].classList.contains('select'),true);
	assert.equal(nodes[3].classList.contains('usable'),true,'An optional passive action remains clickable without the active-skill glow');
	assert.equal(nodes[4].classList.contains('usable'),false);
	context._status.event.skill=undefined;
	updateSkillUsability(nodes,[],context);
	for(const node of nodes){assert.equal(node.classList.contains('usable'),false);assert.equal(node.classList.contains('select'),false);}
	lib.skill.active.enable=false;
	updateSkillUsability(nodes,[],context);
	assert.equal(nodes[0].classList.contains('hh-source-active-skill'),false);
});

test('the native golden frame, particle texture and animated output match their provenance',()=>{
	const root=new URL('../assets/active-skill-glow/',import.meta.url);
	const config=JSON.parse(fs.readFileSync(new URL('sources.json',root),'utf8'));
	for(const record of [config.frame,config.star,config.output]){
		const bytes=fs.readFileSync(new URL(record.file,root));
		assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
		assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],record.size);
	}
	assert.equal(config.starEmitter.rate,10);assert.equal(config.starEmitter.lifetime,1);
	assert.equal(config.animation.frames,20);assert.equal(config.animation.duration,1);
});
