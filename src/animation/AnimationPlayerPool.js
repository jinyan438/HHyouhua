"use strict";

/**
 * @fileoverview 动画播放器对象池，管理多个AnimationPlayer实例以提高性能
 */
import { lib, game, ui, get, ai, _status } from "noname";
import { AnimationPlayer } from "./AnimationPlayer.js";

/**
 * 动画播放器对象池类
 */
export class AnimationPlayerPool {
	/**
	 * @param {number} [size=1] - 池大小
	 * @param {string} pathPrefix - 资源路径前缀
	 * @param {string} [thisName] - 池名称
	 */
	constructor(size, pathPrefix, thisName) {
		if (!self.spine) {
			console.error("spine 未定义.");
			return;
		}
		this.name = thisName;
		this.capacity = size || 1;
		this.pathPrefix = pathPrefix;
		this.fileTypes = new Map();
		// Each player owns a WebGL context. Reserve capacity without occupying
		// all four contexts before they are needed by a simultaneous effect.
		this.animations = [new AnimationPlayer(pathPrefix)];
	}

	/**
	 * 加载骨骼资源到所有播放器
	 * @param {string} filename - 骨骼文件名
	 * @param {string} skelType - 骨骼类型
	 * @param {Function} [onload] - 加载成功回调
	 * @param {Function} [onerror] - 加载失败回调
	 */
	loadSpine(filename, skelType, onload, onerror) {
		this.fileTypes.set(filename, skelType || 'skel');
		this.animations[0].loadSpine(
			filename,
			skelType,
			onload,
			onerror
		);
	}

	/**
	 * 在指定元素上播放骨骼动画
	 * @param {HTMLElement} element - 目标元素
	 * @param {string|Object} animation - 动画名称或配置
	 * @param {Object} [position] - 位置配置
	 */
	playSpineTo(element, animation, position) {
		if (position?.parent) {
			position.parent = undefined;
		}

		// 复用已绑定的播放器
		if (element._ap?.canvas.parentNode === element) {
			this.playReady(element._ap, element, animation, position);
			return;
		}

		// A loading player is reserved for its target until its own textures arrive.
		let ap = this.animations.find(player => !player.running && !player._poolPending?.size);
		if (!ap && this.animations.length < this.capacity) {
			ap = new AnimationPlayer(this.pathPrefix);
			this.animations.push(ap);
		}
		if (ap) {
			element._ap = ap;
			element.appendChild(ap.canvas);
			this.playReady(ap, element, animation, position);
			return;
		}
		console.error(`spine: ${this.name || ""} 可用动画播放组件不足`);
	}

	playReady(player, element, animation, position) {
		const name = typeof animation === 'string' ? animation : animation.name;
		const play = () => { if (player.canvas.parentNode === element) player.playSpine(animation, position); };
		if (player.hasSpine(name)) { play(); return; }
		const pending = player._poolPending ||= new Map();
		if (pending.has(name)) { pending.get(name).push(play); return; }
		pending.set(name, [play]);
		const finish = loaded => {
			const callbacks = pending.get(name) || [];
			pending.delete(name);
			if (loaded) callbacks.forEach(callback => callback());
		};
		// Textures belong to one GL context; do not reuse another player's uploads.
		player.loadSpine(name, this.fileTypes.get(name) || 'skel', () => finish(true), () => finish(false));
	}
}
