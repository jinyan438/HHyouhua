const KEY = "extension_HH优化_enable_settlement_optimize";
const SYSTEM = new Set([
	"useCard", "useSkill", "respond", "draw", "gain", "lose", "loseAsync", "discard", "equip", "replaceEquip",
	"addJudge", "removeJudge", "cardsDiscard", "orderingDiscard", "cardsGotoOrdering", "cardsGotoPile", "cardsGotoSpecial",
	"recover", "loseHp", "changeHp", "changeHujia", "damage", "link", "turnOver", "recast", "addToExpansion",
]);
const CHOICES = new Set([
	"gainPlayerCard", "discardPlayerCard", "viewCards", "showCards", "showHandcards", "moveCard", "pindian", "compare",
	"judge", "rejudge", "dying", "die", "gameDraw", "gameStart", "gameOver", "_wuxie", "_save",
]);
const GAIN_ANIMATIONS = new Set(["draw", "gain", "gain2", "draw2", "give", "giveAuto"]);
const SILENT_SYSTEM = new Set(["draw", "gain", "lose", "loseAsync", "discard", "cardsDiscard", "orderingDiscard", "cardsGotoOrdering", "cardsGotoPile", "cardsGotoSpecial"]);

export function setupSettlementOptimization({ lib, game, get, _status }, config = {}, environment = {}) {
	if (game.hhSettlement) return game.hhSettlement;
	const env = { now: () => performance.now(), yieldTask: () => new Promise(resolve => {
		let frame, timer;
		const done = () => { clearTimeout(timer); if (frame != null) cancelAnimationFrame(frame); resolve(); };
		timer = setTimeout(done, 16);
		if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(done);
	}), ...environment };
	const original = { delay: game.delay, delayx: game.delayx };
	const stats = { defaultWaits: 0, gainHolds: 0, batchHolds: 0, layoutPassesSaved: 0, yields: 0 };
	let fallback = config.enable_settlement_optimize !== false, lastYield = env.now(), operations = 0, yielding;
	const enabled = () => (lib.config[KEY] ?? fallback) === true;

	function canOptimize(event = _status.event) {
		if (!enabled() || !event || game.online || _status.connectMode || _status.video || _status.over) return false;
		if (_status.paused || _status.paused2 || _status.paused3 || _status.imchoosing || _status.waitingForTransition
			|| _status.pauseManager?.pause3?.isStarted) return false;
		const name = event.name || "";
		if (/^(choose|phase)/.test(name) || CHOICES.has(name)) return false;
		if (event.forceWait || event.waitingForTransition || event.dialog || typeof event.animate === "function"
			|| typeof event.delay === "number" || typeof event.autodelay === "number" || event.delay_time != null) return false;
		if (name === "delay" || name === "delayx") {
			const parent = event.parent || event.getParent?.();
			return !event._args?.length && !!parent && parent !== event && canOptimize(parent);
		}
		return SYSTEM.has(name) || ["card", "precard", "postcard"].includes(event.type)
			|| typeof lib.card?.[name]?.content === "function" || Array.isArray(lib.card?.[name]?.content)
			|| !!lib.skill?.[event.skill || name]?.content;
	}
	function paddingScope(event) {
		if (["delay", "delayx"].includes(event?.name) && !event._args?.length) return paddingScope(event.parent || event.getParent?.());
		return event;
	}
	function canSkipPadding(event) {
		const scope = paddingScope(event);
		// Default card/skill waits also pace CSS, canvas and Spine effects, including third-party ones.
		// Only a managed arrival or an explicitly silent data operation proves this padding redundant.
		return scope?._HH_gainMotionManaged === true || SILENT_SYSTEM.has(scope?.name)
			&& (scope.animate === false || lib.config.animation === false);
	}

	function yieldControl() {
		if (yielding) return yielding;
		if (++operations < 64 && env.now() - lastYield < 8) return Promise.resolve();
		operations = 0; stats.yields++;
		const task = env.yieldTask();
		// Native callers may schedule a delay without awaiting its return value.
		yielding = (_status.pauseManager?.setDelay ? _status.pauseManager.setDelay(task) : task).finally(() => {
			lastYield = env.now(); yielding = null;
		});
		return yielding;
	}

	for (const method of ["delay", "delayx"]) {
		if (typeof original[method] !== "function") continue;
		game[method] = function (...args) {
			const event = _status.event;
			if (canOptimize(event)) {
				if (!args.length && canSkipPadding(event)) { stats.defaultWaits++; return yieldControl(); }
				// Native gaincardMultiple puts these cosmetic holds in front of its child gains.
				if (method === "delay" && args.length === 2 && args[0] === 0 && event._HH_gainMotionManaged && event.gain_list && GAIN_ANIMATIONS.has(event.animate)
					&& [500, 700].some(ms => args[1] === (get.delayx ? get.delayx(ms, ms) : ms))) {
					stats.batchHolds++; return yieldControl();
				}
			}
			return original[method].apply(this, args);
		};
	}

	const controller = {
		canOptimize,
		fastGain(event) {
			if (!GAIN_ANIMATIONS.has(event.animate) || !canOptimize(event) || !game.hhDrawMotion?.enabled
				|| typeof game.hhDrawMotion.waitForGain !== "function") return false;
			stats.gainHolds++; void yieldControl(); return true;
		},
		coalesceLayout() {
			if (!enabled() || game.online || _status.connectMode || _status.video) return false;
			stats.layoutPassesSaved++; return true;
		},
		setEnabled(value) { fallback = lib.config[KEY] = value === true; },
		get enabled() { return enabled(); },
		snapshot() { return { ...stats }; },
	};
	game.hhSettlement = controller;
	return controller;
}
