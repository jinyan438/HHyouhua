"use strict";

/**
 * @fileoverview 动画系统初始化模块，注册技能动画和卡牌触发器
 */

import { lib, game, ui, get, ai, _status } from "noname";
import { skillDefines, cardDefines } from "./configs/skillAnimations.js";
import { cardTriggers } from "./configs/cardTriggers.js";
import { setupSourceCardAnimations } from "../effects/sourceCardAnimations.js";
import { setupTargetIndicators } from "./targetIndicator.js";
import { setupSourceDamageEffects } from "../effects/sourceDamageEffects.js";
import { setupSourceChainEffects } from "../effects/sourceChainEffects.js";

/**
 * 初始化技能动画定义和绑定
 * @param {AnimationPlayer} animation - 动画播放器实例
 */
export function initSkillAnimations(animation) {
	const damageEffects = setupSourceDamageEffects({ lib, game, ui });
	// 数字特效播放函数
	animation.playLoseHp = player => {
		if (!player) return;
		animation.playSpine("effect_loseHp", { scale: 0.6, speed: 0.8, parent: player });
	};

	animation.playRecoverNumber = (player, num) => {
		if (!player || !num || num < 1 || num > 9 || lib.config.extension_HH优化_newDecadeStyle === "off") return;
		animation.playSpine({ name: "globaltexiao/huifushuzi/shuzi2", action: String(num) }, { speed: 0.6, scale: 0.5, parent: player, y: 20 });
	};

	animation.playVirtualDamageNumber = (player, num) => {
		if (!player || num < 0 || num > 9) return;
		animation.playSpine(
			{ name: "globaltexiao/xunishuzi/SS_PaiJu_xunishanghai", action: "play" + num },
			{ speed: 0.6, scale: 0.5, parent: player, y: 20 }
		);
	};

	animation.playDamageNumber = (player, num) => {
		if (player) return damageEffects.number(player, num);
	};

	setupTargetIndicators({ lib, game, ui, animation, getConfig: () => decadeUI.config.chupaizhishi });

	// 注册卡牌动画
	for (const [cardName, config] of Object.entries(cardDefines)) {
		lib.animate.card[cardName] = card => {
			animation.playSpine(config.name, { x: config.x, y: config.y, scale: config.scale });
		};
	}

	// 注册技能动画
	for (const [skillName, config] of Object.entries(skillDefines)) {
		lib.animate.skill[skillName] = function (name) {
			animation.playSpine(config.name, {
				x: config.x,
				y: config.y,
				scale: config.scale,
				parent: this,
			});
		};
	}

	setupSourceCardAnimations({ lib, game, ui, get, ai, _status });
	setupSourceChainEffects({ lib, game, ui, get });

	// 应用卡牌触发器
	for (const [cardName, triggers] of Object.entries(cardTriggers)) {
		if (!lib.card[cardName]) continue;
		Object.assign(lib.card[cardName], triggers);
	}
}
