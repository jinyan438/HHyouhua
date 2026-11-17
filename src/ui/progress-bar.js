/**
 * @fileoverview 进度条与提示模块
 * 包含玩家进度条、AI进度条、阶段提示等功能
 */

import { lib, game, ui, get, ai, _status } from "noname";
import { initGTBB } from "./gtbb.js";
import { initPhaseTipsSkills } from "./phase-tips.js";
import { createPlayerTip } from "./playerTip.js";

// ==================== 常量定义 ====================

/** @type {string} 进度条元素ID */
const PROGRESS_BAR_ID = "jindutiaopl";

/** @type {number[]} 默认位置 [x, y, width, height] */
const DEFAULT_POS = [0, 0, 100, 100];

/** @type {number} 动画持续时间(毫秒) */
const ANIMATION_DURATION = 1000;

/** @type {number} AI计时器间隔(毫秒) */
const AI_TIMER_INTERVAL = 150;

const AI_ANIMATION_INTERVAL = 32;

/** @type {number} 红色阈值 */
const RED_THRESHOLD = 395 / 3;

/** @type {number} 检查间隔(毫秒) */
const CHECK_INTERVAL = 100;

// ==================== 工具函数 ====================

/**
 * 清除定时器
 * @param {string} name - 定时器名称
 */
const clearTimer = name => {
	if (window[name]) {
		clearInterval(window[name]);
		delete window[name];
	}
};

/**
 * 通过ID移除元素
 * @param {string} id - 元素ID
 */
const removeElementById = id => document.getElementById(id)?.remove();

/**
 * 判断是否为手杀样式
 * @returns {boolean}
 */
const isShoushaSyle = () => {
	const style = lib.config.extension_HH优化_newDecadeStyle;
	return style !== "on" && style !== "othersOff";
};

/**
 * 移除第一个匹配类名的元素
 * @param {HTMLElement} parent - 父元素
 * @param {string} className - 类名
 */
const removeFirst = (parent, className) => {
	parent.getElementsByClassName(className)[0]?.remove();
};

// ==================== 进度条配置 ====================

/**
 * 获取进度条配置
 * @returns {object} 进度条配置对象
 */
const getProgressBarConfig = () => {
	const styleType = lib.config.extension_HH优化_jindutiaoYangshi;
	const bottom = parseFloat(lib.config["extension_HH优化_jindutiaoSet"]) + "%";

	/** @type {Record<string, object>} */
	const configs = {
		1: {
			container: {
				backgroundColor: "rgba(0,0,0,0.4)",
				width: "620px",
				height: "12.3px",
				borderRadius: "1000px",
				boxShadow: "0px 0px 9px #2e2b27 inset,0px 0px 2.1px #FFFFD5",
				overflow: "hidden",
				border: "1.2px solid #000000",
				position: "fixed",
				left: "calc(50% - 300px)",
				bottom,
			},
			progressBar: { data: 620, style: "background-image: linear-gradient(#fccc54 15%, #d01424 30%, #cc6953 90%);height:12.8px;" },
			clearSpecial: true,
		},
		2: {
			container: { width: "400px", height: "24px", display: "block", left: "calc(50% - 197px)", position: "fixed", bottom },
			progressBar: {
				data: 300,
				style: "width:280px;height:4.3px;margin:14px 0 0 85px;background-color:#E2E20A;border-right:5px solid #FFF;position:absolute;top:-3.5px;",
			},
			backgroundImage: {
				src: "extension/HH优化/ui/assets/lbtn/uibutton/jindutiao.png",
				style: "--w:400px;--h:calc(var(--w)*44/759);width:var(--w);height:var(--h);position:absolute;top:0;",
			},
			clearSpecial: true,
		},
		3: {
			container: {
				width: "400px",
				height: "13px",
				display: "block",
				boxShadow: "0 0 4px #000000",
				margin: "0 0 !important",
				position: "fixed",
				left: "calc(50% - 197px)",
				bottom,
			},
			progressBar: {
				data: 395,
				style: "z-index:1;width:399px;height:8px;margin:0 0 0 1px;background-color:#F4C336;border-top:3px solid #EBE1A7;border-bottom:2px solid #73640D;border-left:1px solid #73640D;position:absolute;top:0px;border-radius:3px;",
			},
			secondaryBar: {
				data: 395,
				style: "width:399px;height:0.1px;margin:0 0 0 0.5px;background-color:#fff;opacity:0.8;border-top:1px solid #FFF;border-bottom:1px solid #FFF;border-left:1px solid #FFF;position:absolute;top:17px;border-radius:2px;",
			},
			backgroundImages: [
				{
					src: "extension/HH优化/ui/assets/lbtn/uibutton/jindutiao2.1.png",
					style: "width:400px;height:4px;position:absolute;top:16px;z-index:-1;",
				},
				{
					src: "extension/HH优化/ui/assets/lbtn/uibutton/jindutiao2.png",
					style: "width:400px;height:13px;position:absolute;top:0;opacity:0;",
				},
				{
					src: "extension/HH优化/ui/assets/lbtn/uibutton/jindutiao2.1.png",
					style: "width:400px;height:14px;position:absolute;top:0;z-index:-1;",
				},
			],
			setSpecial: true,
		},
		4: {
			container: {
				width: "450px",
				height: "13px",
				display: "block",
				margin: "0 0 !important",
				position: "fixed",
				left: "calc(50% - 220px)",
				bottom,
				backgroundColor: "#4B3621",
				borderRadius: "6px",
			},
			progressBar: {
				data: 449,
				style: "z-index:1;width:449px;height:12px;margin:0;background-color:rgb(230,151,91);position:absolute;top:1px;border-radius:6px;",
			},
			clearSpecial: true,
		},
	};
	return configs[styleType] ?? configs[1];
};

// ==================== 元素创建 ====================

/**
 * 创建图片元素
 * @param {string} src - 图片路径
 * @param {string} style - CSS样式
 * @returns {HTMLImageElement}
 */
const createImg = (src, style) => {
	const img = document.createElement("img");
	img.src = `${lib.assetURL}${src}`;
	img.style.cssText = style;
	return img;
};

/**
 * 创建div元素
 * @param {number} data - 数据值
 * @param {string} style - CSS样式
 * @returns {HTMLDivElement}
 */
const createDiv = (data, style) => {
	const el = document.createElement("div");
	el.data = data;
	el.style.cssText = style;
	return el;
};

/**
 * 创建AI进度条
 * @param {boolean} isPhase - 是否为阶段进度条
 * @returns {{container: HTMLDivElement, boxTime: HTMLDivElement}}
 */
const createAIProgressBar = isPhase => {
	const container = document.createElement("div");
	const boxTime = document.createElement("div");
	const imgBg = document.createElement("img");
	const isShousha = isShoushaSyle();

	container.classList.add(isPhase ? "timePhase" : "timeai");

	if (isShousha) {
		container.style.cssText =
			"display:block;position:absolute;z-index:90;--w:122px;--h:calc(var(--w)*4/145);width:var(--w);height:var(--h);left:3.5px;bottom:-6.2px;";
		boxTime.data = 120;
		boxTime.style.cssText =
			"z-index:92;width:120px;height:3px;margin:1px;background-color:#dd9900;position:absolute;top:0;";
		imgBg.src = `${lib.assetURL}extension/HH优化/ui/assets/lbtn/uibutton/time.png`;
		imgBg.style.cssText = "position:absolute;z-index:91;--w:122px;--h:calc(var(--w)*4/145);width:var(--w);height:var(--h);top:0;";
	} else {
		container.style.cssText =
			"display:block;position:absolute;z-index:90;--w:122px;--h:calc(var(--w)*8/162);width:var(--w);height:var(--h);left:1.5px;bottom:-14px;";
		boxTime.data = 120;
		boxTime.style.cssText = "z-index:91;width:120px;height:3.3px;margin:1px;background-color:#f2c84b;position:absolute;top:0;border-radius:3px;";
		imgBg.src = `${lib.assetURL}extension/HH优化/ui/assets/lbtn/uibutton/timeX.png`;
		imgBg.style.cssText = "position:absolute;z-index:90;--w:122px;--h:calc(var(--w)*8/162);width:var(--w);height:var(--h);top:0;";
	}

	container.appendChild(boxTime);
	container.appendChild(imgBg);
	return { container, boxTime };
};

/**
 * 创建提示图片
 * @param {string} className - CSS类名
 * @param {string} imgName - 图片名称
 * @returns {HTMLImageElement}
 */
const createTipImg = (className, imgName) => {
	return createPlayerTip(lib, className, imgName);
};

// ==================== 预加载UI初始化 ====================

/**
 * 初始化预加载UI
 * 包括玩家进度条、文字显示、图片显示等功能
 */
export function initPrecontentUI() {
	// 玩家进度条
	game.Jindutiaoplayer = () => {
		clearTimer("timer");
		clearTimer("timer2");
		removeElementById(PROGRESS_BAR_ID);

		const container = document.createElement("div");
		container.id = PROGRESS_BAR_ID;
		const cfg = getProgressBarConfig();

		if (cfg.clearSpecial) delete window.jindutiaoTeshu;
		if (cfg.setSpecial && !window.jindutiaoTeshu) window.jindutiaoTeshu = true;

		Object.assign(container.style, cfg.container);
		const boxTime = createDiv(cfg.progressBar.data, cfg.progressBar.style);
		container.appendChild(boxTime);

		let boxTime2 = null,
			imgBg3 = null;
		if (cfg.secondaryBar) {
			boxTime2 = createDiv(cfg.secondaryBar.data, cfg.secondaryBar.style);
			container.appendChild(boxTime2);
		}
		if (cfg.backgroundImage) container.appendChild(createImg(cfg.backgroundImage.src, cfg.backgroundImage.style));
		if (cfg.backgroundImages) {
			cfg.backgroundImages.forEach((c, i) => {
				const img = createImg(c.src, c.style);
				if (i === 0) imgBg3 = img;
				container.appendChild(img);
			});
		}

		document.body.appendChild(container);
		const interval = parseFloat(lib.config.extension_HH优化_jindutiaoST);

		window.timer = setInterval(() => {
			boxTime.style.width = `${boxTime.data}px`;
			boxTime.style.backgroundColor = boxTime.data <= RED_THRESHOLD ? "rgba(230,56,65,0.88)" : "rgb(230,151,91)";
			if (--boxTime.data === 0) {
				clearTimer("timer");
				container.remove();
			}
		}, interval);

		if (window.jindutiaoTeshu && boxTime2 && imgBg3) {
			window.timer2 = setInterval(() => {
				boxTime2.style.width = `${--boxTime2.data}px`;
				if (boxTime2.data === 0) {
					clearTimer("timer2");
					delete window.jindutiaoTeshu;
					boxTime2.remove();
					imgBg3.remove();
				}
			}, interval / 2);
		}
	};

	/**
	 * 移除文字显示
	 */
	game.as_removeText = () => {
		_status.as_showText?.remove();
		delete _status.as_showText;
		_status.as_showImage?.show();
	};

	/**
	 * 显示文字
	 * @param {string} str - 文字内容
	 * @param {number[]} [pos] - 位置数组
	 * @param {boolean|number} [time] - 显示时间
	 * @param {string} [font] - 字体
	 * @param {number} [size] - 字号
	 * @param {string} [color] - 颜色
	 * @returns {boolean} 是否成功
	 */
	game.as_showText = (str, pos, time, font = "shousha", size = 16, color = "#ffffff") => {
		if (!str) return false;
		pos = Array.isArray(pos) ? pos : DEFAULT_POS;
		time = time === true || typeof time === "number" ? time : 3;

		game.as_removeText();
		const div = ui.create.div("", str, ui.window);
		div.style.cssText = `z-index:-3;pointer-events:none;font-family:${font};font-size:${size}px;color:${color};line-height:${size * 1.2}px;text-align:center;left:${pos[0] + pos[2] / 2}%;top:${pos[1]}%;width:0%;height:${pos[3]}%;position:absolute;transition:all 1s`;
		_status.as_showText = div;
		_status.as_showImage?.hide();

		setTimeout(() => {
			div.style.left = `${pos[0]}%`;
			div.style.width = `${pos[2]}%`;
		}, 1);
		if (time !== true) setTimeout(game.as_removeText, time * 1000);
		return true;
	};

	/**
	 * 移除图片显示
	 */
	game.as_removeImage = () => {
		if (_status.as_showImage) {
			const el = _status.as_showImage;
			el.style.animation = "left-to-right-out 1s";
			delete _status.as_showImage;
			setTimeout(() => el.remove(), ANIMATION_DURATION);
		}
	};

	/**
	 * 显示图片
	 * @param {string} url - 图片URL
	 * @param {number[]} [pos] - 位置数组
	 * @param {boolean|number} [time] - 显示时间
	 * @returns {boolean} 是否成功
	 */
	game.as_showImage = (url, pos, time) => {
		if (!url) return false;
		pos = Array.isArray(pos) ? pos : DEFAULT_POS;
		time = time === true || typeof time === "number" ? time : 3;

		game.as_removeImage();
		const div = ui.create.div("", "", ui.window);
		div.style.cssText = `z-index:-1;pointer-events:none;left:${pos[0]}%;top:${pos[1]}%;width:8%;height:${pos[3]}%;position:absolute;background-size:100% 100%;background-position:center;background-image:url(${lib.assetURL}${url});transition:all 1s`;
		_status.as_showImage = div;
		_status.as_showText && div.hide();

		if (time !== true) setTimeout(game.as_removeImage, time * 1000);
		return true;
	};
}

// ==================== 进度条监视器 ====================

/**
 * 设置进度条监视器
 * @param {object} config - 配置对象
 */
const setupWatcher = config => {
	let playerShown = false,
		thinking = null,
		watcher = null;
	const aiPlayers = new Map();

	const showPlayer = () => {
		if (playerShown) return;
		playerShown = true;
		game.Jindutiaoplayer();
	};

	const hidePlayer = () => {
		if (!playerShown) return;
		playerShown = false;
		clearTimer("timer");
		clearTimer("timer2");
		removeElementById(PROGRESS_BAR_ID);
	};

	// 暴露重置方法供配置热更新使用
	window.resetProgressBarState = () => {
		playerShown = false;
	};

	/**
	 * 显示AI进度条
	 * @param {HTMLElement} player - 玩家元素
	 */
	const showAI = (player, thought = null) => {
		if (!player || (!thought && player === game.me) || aiPlayers.has(player)) return;
		removeFirst(player, "timeai");
		removeFirst(player, "timePhase");

		const { container, boxTime } = createAIProgressBar(_status.currentPhase === player);
		player.appendChild(container);
		const entry = { container, thought, timer: null, tip: null };
		aiPlayers.set(player, entry);
		if (thought?.showTip) {
			removeFirst(player, "playertip");
			removeFirst(player, "tipskill");
			entry.tip = createTipImg("hh-ai-thinking", "thinktip.png");
			entry.tip.alt = "思考中";
			entry.tip.setAttribute("role", "status");
			player.appendChild(entry.tip);
		}

		const startedAt = thought?.startedAt ?? performance.now();
		const duration = thought?.duration ?? boxTime.data * AI_TIMER_INTERVAL;
		boxTime.style.transformOrigin = "left center";
		boxTime.style.transition = "none";
		const update = () => {
			const remaining = Math.max(0, 1 - (performance.now() - startedAt) / duration);
			boxTime.style.transform = `scaleX(${remaining})`;
			if (remaining === 0) {
				clearInterval(entry.timer);
				// 模拟思考由实际等待的 finally 清理，避免动画先结束时闪回普通进度条。
				if (!thought) container.remove();
			}
		};
		entry.timer = setInterval(update, AI_ANIMATION_INTERVAL);
		update();
	};

	const hideAllAI = () => {
		aiPlayers.forEach(entry => {
			clearInterval(entry.timer);
			entry.container.remove();
			entry.tip?.remove();
		});
		aiPlayers.clear();
	};

	/**
	 * 显示单个AI进度条
	 * @param {HTMLElement} player - 玩家元素
	 */
	const showOneAI = (player, thought = null) => {
		if (!player || (!thought && player === game.me)) return;
		if (aiPlayers.size === 1 && aiPlayers.get(player)?.thought === thought) return;
		hideAllAI();
		showAI(player, thought);
	};

	const showAllAI = () => {
		const players = game.players.filter(p => p !== game.me);
		if (aiPlayers.size === players.length && players.every(p => aiPlayers.has(p) && !aiPlayers.get(p).thought)) return;
		hideAllAI();
		players.forEach(p => showAI(p));
	};

	const check = () => {
		const event = _status.event;
		if (_status.over || game.hhRescueFlow?.active) { hidePlayer(); hideAllAI(); return; }
		// 原生暂停状态不覆盖独立的 AI 等待；同一次思考复用节点和起始时间。
		if (thinking) {
			hidePlayer();
			showOneAI(thinking.player, thinking);
			return;
		}
		const waiting = event?.player && (_status.paused || _status.imchoosing);
		const isWuxie = event?.type === "wuxie";

		if (waiting) {
			if (isWuxie) {
				if (lib.config.extension_HH优化_jindutiaoYangshi !== "0") showPlayer();
				showAllAI();
			} else if (event.player === game.me) {
				hideAllAI();
				if (lib.config.extension_HH优化_jindutiaoYangshi !== "0") showPlayer();
			} else {
				hidePlayer();
				showOneAI(event.player);
			}
		} else {
			hidePlayer();
			hideAllAI();
		}
	};

	const start = () => {
		if (!watcher) watcher = setInterval(check, CHECK_INTERVAL);
	};
	const stop = () => {
		if (watcher) {
			clearInterval(watcher);
			watcher = null;
		}
		thinking = null;
		hidePlayer();
		hideAllAI();
	};

	game.hhAIThinkProgress = {
		begin(player, duration, showTip) {
			if (_status.over || !player || !(duration > 0)) return null;
			thinking = { player, duration, showTip, startedAt: performance.now() };
			check();
			return thinking;
		},
		end(token) {
			if (!token || thinking !== token) return;
			thinking = null;
			hideAllAI();
		},
	};

	const waitStart = setInterval(() => {
		if (_status.gameStarted) {
			clearInterval(waitStart);
			start();
		}
	}, CHECK_INTERVAL);

	lib.onover.push(stop);
};

// ==================== 提示监视器 ====================

/**
 * 设置提示监视器
 */
const setupTipWatcher = () => {
	let lastPhasePlayer = null,
		lastDiscardPlayer = null;

	const check = () => {
		if (!_status.gameStarted || !game.players) return;

		// 出牌阶段提示
		const phase = _status.currentPhase;
		if (phase && phase !== game.me && phase.isPhaseUsing?.() && !phase.getElementsByClassName("hh-ai-thinking")[0]) {
			if (lastPhasePlayer !== phase) {
				if (lastPhasePlayer) removeFirst(lastPhasePlayer, "playertip");
				lastPhasePlayer = phase;
				if (!phase.getElementsByClassName("playertip")[0]) {
					phase.appendChild(createTipImg("playertip", isShoushaSyle() ? "tip.png" : "phasetip.png"));
				}
			}
		} else if (lastPhasePlayer) {
			removeFirst(lastPhasePlayer, "playertip");
			lastPhasePlayer = null;
		}

		// 弃牌阶段提示
		const event = _status.event;
		if (event?.name === "phaseDiscard" && event.player !== game.me) {
			if (lastDiscardPlayer !== event.player) {
				if (lastDiscardPlayer) removeFirst(lastDiscardPlayer, "playertipQP");
				lastDiscardPlayer = event.player;
				if (!event.player.getElementsByClassName("playertipQP")[0]) {
					event.player.appendChild(createTipImg("playertipQP", isShoushaSyle() ? "tipQP.png" : "discardtip.png"));
				}
			}
		} else if (lastDiscardPlayer) {
			removeFirst(lastDiscardPlayer, "playertipQP");
			lastDiscardPlayer = null;
		}
	};

	const waitStart = setInterval(() => {
		if (_status.gameStarted) {
			clearInterval(waitStart);
			setInterval(check, CHECK_INTERVAL);
		}
	}, CHECK_INTERVAL);
};

// ==================== 卡牌提示监视器 ====================

/**
 * 设置卡牌提示监视器
 */
const setupCardTipWatcher = () => {
	if (!isShoushaSyle()) return;

	/** @type {Record<string, {cls: string, img: string}>} */
	const tips = {
		sha: { cls: "playertipsha", img: "tipsha.png" },
		shan: { cls: "playertipshan", img: "tipshan.png" },
		tao: { cls: "playertiptao", img: "tiptao.png" },
		jiu: { cls: "playertipjiu", img: "tipjiu.png" },
	};
	/** @type {Map<HTMLElement, string>} */
	const shown = new Map();

	lib.announce.subscribe("Noname.Game.Event.Trigger", data => {
		const { name, event } = data;
		if (!["useCardBegin", "respondBegin"].includes(name)) return;
		if (!event?.card || event.player === game.me) return;

		const cardName = event.card.name || event.card.viewAs;
		const tip = tips[cardName];
		if (!tip || event.player.getElementsByClassName(tip.cls)[0]) return;

		removeFirst(event.player, "tipskill");
		event.player.appendChild(createTipImg(tip.cls, tip.img));
		shown.set(event.player, tip.cls);
	});

	lib.announce.subscribe("Noname.Game.Event.Trigger", data => {
		const { name } = data;
		if (!["useCardEnd", "respondEnd", "phaseBegin", "phaseEnd", "dieBegin"].includes(name)) return;
		shown.forEach((cls, player) => removeFirst(player, cls));
		shown.clear();
	});
};

// ==================== 模块注册 ====================

/**
 * 注册旧版模块
 * @param {object} config - 配置对象
 */
export function registerLegacyModules(config) {
	// 兼容旧API
	lib.removeFirstByClass = lib.removeFirstByClass || ((p, c) => p.getElementsByClassName(c)[0]?.remove());
	lib.createTipImg =
		lib.createTipImg ||
		((c, s, st) => {
			const i = document.createElement("img");
			i.classList.add("tipshow", c);
			i.src = s;
			i.style.cssText = st;
			return i;
		});

	// 初始化阶段提示技能
	initPhaseTipsSkills();

	if (get.mode() === "connect") {
		initGTBB();
		return;
	}

	setupWatcher(config);
	setupTipWatcher();
	setupCardTipWatcher();
	initGTBB();
}
