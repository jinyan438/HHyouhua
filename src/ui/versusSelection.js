import { bindSelectionCardInput } from './selectionCardInput.js';
import { createVersusRecommendation } from './versusRecommendation.js';

// SelectGeneralHappyNewWindow: a six-column portrait grid and two seat previews.
// The native chooseButton event remains the sole owner of candidates and results.
export function createVersusSelection({ lib, game, ui, get, _status }, { root, dialog, event, parent, listen, later, cancel, isCurrent, onChoose, onInspect, paintPreview }) {
	const make = (tag, cls, text, host = root) => {
		const node = document.createElement(tag); node.className = cls;
		if (text !== undefined) node.textContent = text;
		if (tag === 'button') node.type = 'button';
		host.appendChild(node); return node;
	};
	const previews = make('div', 'hh-versus-previews');
	const slots = ['self', 'mate'].map(side => {
		const slot = make('button', `hh-versus-preview hh-versus-${side}`, undefined, previews);
		const content = make('div', 'hh-versus-preview-content', undefined, slot);
		const tag = make('span', 'hh-versus-preview-tag', undefined, slot);
		tag.setAttribute('aria-hidden', 'true');
		const state = make('span', 'hh-versus-preview-state', '', slot);
		bindSelectionCardInput(slot, { listen, later, cancel, activate: () => {
			if (!isCurrent() || !slot._hhButton) return;
			if (side === 'mate' && recommendation?.current && !recommending) { onInspect(slot._hhButton); return; }
			if (dialog.buttons.includes(slot._hhButton)) onChoose(slot._hhButton);
			else onInspect(slot._hhButton);
		} });
		return { slot, content, state, id: '' };
	});
	const order = make('div', 'hh-versus-order');
	const recommendation = createVersusRecommendation({ lib, game, get, _status }, parent);
	recommendation?.observeChoice(event);
	const recommendButton = make('button', 'hh-versus-recommend');
	const recommendPortrait = make('span', 'hh-versus-recommend-portrait', undefined, recommendButton);
	recommendPortrait.setAttribute('aria-hidden', 'true');
	make('span', 'hh-versus-recommend-label', '为他推荐', recommendButton);
	let recommending = false, pendingButton = null;
	bindSelectionCardInput(recommendButton, { listen, later, cancel, activate: () => {
		if (!isCurrent() || !recommendation?.target()) return;
		recommending = !recommending; update(pendingButton);
	} });
	const map = root.querySelector('.hh-seat-map');
	const prompt = root.querySelector('.hh-selection-prompt');
	const progress = root.querySelector('.hh-selection-progress');
	// Offline chooseCharacter has no server deadline. Only display a countdown
	// when the owning event supplies a real timeout, rather than inventing one.
	progress.hidden = !(Number(event.timeout) > 0);
	let remaining = Number(event.timeout) * 1000, lastTime = Date.now(), disposed = false;
	let animationFrame = null, effectGeneration = 0, renderer = null, model = null, effects = null;
	const selected = () => ui.selected.buttons.filter(button => dialog.buttons.includes(button));
	const ally = player => player === game.me || (game.me.side !== undefined && player.side === game.me.side);
	const mate = () => game.players.find(player => player !== game.me && ally(player));
	const assign = () => !!parent.two_assign;
	const replacement = () => !!_status.replacetwo;
	const mateIndex = () => replacement() ? 2 : 1;
	function playerForIndex(index) {
		return assign() && index >= mateIndex() ? mate() : game.me;
	}
	function description(index) {
		const player = playerForIndex(index);
		const who = player && player !== game.me ? '队友' : '我方';
		return `${who}${replacement() && index % 2 === 1 ? '替补' : '武将'}`;
	}
	function paintCandidate(button) {
		if (!button.querySelector('.hh-versus-portrait')) {
			make('span', 'hh-versus-portrait', undefined, button).setAttribute('aria-hidden', 'true');
		}
		button.querySelector('.hh-versus-name')?.remove();
		make('span', 'hh-versus-name', get.translation(button.link).replace(/<[^>]*>/g, ''), button);
	}
	function stopEffect() {
		effectGeneration++;
		if (animationFrame !== null) cancelAnimationFrame(animationFrame);
		animationFrame = null;
	}
	async function playEffect(host) {
		if (lib.config.animation === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		stopEffect(); const generation = effectGeneration;
		try {
			if (!effects) {
				effects = import('../effects/killCombo.js').then(async api => {
					const base = `${lib.assetURL || ''}extension/HH优化/assets/versus-selection/OL_PaiJu_Xuanjiang`;
					const [spine, atlas, bytes, image] = await Promise.all([
						api.loadSpine4Runtime(), api.readSpine4Asset(base + '.atlas.txt'), api.readSpine4Asset(base + '.skel', true), api.loadSpine4Image(base + '.png'),
					]);
					return { api, model: api.decodeKillCombo(spine, { action: 'play' }, atlas, bytes, { 'OL_PaiJu_Xuanjiang.png': image }) };
				});
			}
			const loaded = await effects;
			if (disposed || generation !== effectGeneration) return;
			if (!renderer) {
				const canvas = make('canvas', 'hh-versus-effect', undefined, host);
				renderer = new loaded.api.KillComboRenderer(canvas); model = loaded.model; renderer.upload(model);
			} else host.appendChild(renderer.canvas);
			const started = performance.now();
			const draw = now => {
				if (disposed || generation !== effectGeneration) return;
				const time = (now - started) / 1000;
				renderer.draw(model, time, { scale: renderer.canvas.getBoundingClientRect().height / 285 });
				animationFrame = time < model.animation.duration ? requestAnimationFrame(draw) : null;
			};
			animationFrame = requestAnimationFrame(draw);
		} catch (error) { console.warn('[HH优化] 选将动画加载失败', error); }
	}
	function show(slot, button, text, active) {
		const id = button?.link || '';
		if (id !== slot.id) {
			slot.content.replaceChildren(); slot.id = id;
			if (id) {
				const card = ui.create.button(id, 'character', slot.content, true);
				card.classList.add('hh-general'); paintPreview(card);
				if (active) playEffect(slot.slot);
			}
		}
		slot.slot._hhButton = button;
		slot.slot.classList.toggle('hh-versus-active', active);
		slot.slot.classList.toggle('hh-versus-empty', !id);
		slot.slot.setAttribute('aria-label', id ? `${get.translation(id)}，${text}` : text);
		slot.state.textContent = text;
	}
	function update(pending) {
		pendingButton = pending;
		const chosen = selected(), max = get.select(event.selectButton)[1];
		recommendation?.sync(dialog.buttons.map(button => button.link));
		const canRecommend = !!recommendation?.target() && dialog.buttons.some(button => recommendation.allowed(button.link));
		if (!canRecommend) recommending = false;
		recommendButton.hidden = !canRecommend;
		recommendButton.setAttribute('aria-pressed', String(recommending));
		root.classList.toggle('hh-versus-recommending', recommending);
		const recommended = recommendation?.current;
		const recommendedButton = recommended && dialog.buttons.find(button => button.link === recommended.id);
		recommendButton.setAttribute('aria-label', recommended ? `为他推荐，已推荐${get.translation(recommended.id)}` : '为他推荐');
		recommendPortrait.style.backgroundImage = recommendedButton?.style.backgroundImage || '';
		const current = playerForIndex(chosen.length), currentMate = current !== game.me;
		let selfButton = currentMate ? chosen[0] : pending || chosen.at(-1);
		if (!selfButton && game.me.name1 && lib.character[game.me.name1]) selfButton = { link: game.me.name1 };
		let mateButton = currentMate ? pending || chosen.at(-1) : assign() ? chosen[mateIndex()] : null;
		if (recommendedButton) mateButton = recommendedButton;
		if (!mateButton && mate()?.name1 && lib.character[mate().name1]) mateButton = { link: mate().name1 };
		show(slots[0], selfButton, selfButton ? (chosen.includes(selfButton) ? '我方已选' : '我方预选') : '请选择武将', !currentMate);
		show(slots[1], mateButton, recommendedButton ? '已为队友推荐' : mateButton ? (chosen.includes(mateButton) || !dialog.buttons.includes(mateButton) ? '队友已选' : '队友预选') : assign() ? '选择队友武将' : '队友待选', currentMate || recommending);
		slots[1].slot.hidden = !mate();
		prompt.textContent = recommending ? '请选择推荐给队友的武将' : max > 1 ? `请选择${description(chosen.length)}（${chosen.length}/${max}）` : pending ? '再次点击确认选择' : '请选择武将';
		if (order._hhKey !== chosen.map(button => button.link).join('|')) {
			order._hhKey = chosen.map(button => button.link).join('|'); order.replaceChildren();
			chosen.forEach((button, index) => {
				const item = make('button', 'hh-versus-chosen', `${description(index)} · ${get.translation(button.link)}`, order);
				listen(item, 'click', e => { e.stopPropagation(); onChoose(button); });
			});
		}
		map.replaceChildren();
		map.hidden = !game.players.length;
		const first = _status.firstAct || game.players[0];
		const players = [...game.players].sort((a, b) => get.distance(first, a, 'absolute') - get.distance(first, b, 'absolute'));
		players.forEach((player, index) => {
			const seat = make('button', 'hh-seat', `${player === game.me ? '我' : ally(player) ? '友' : '敌'}\n${get.cnNumber(index + 1, true)}`, map);
			seat.classList.toggle('hh-seat-enemy', !ally(player));
			seat.classList.toggle('hh-seat-me', player === game.me);
			const half = Math.ceil(players.length / 2), side = ally(player) ? 1 : 0;
			const column = players.filter((p, i) => i < index && (ally(p) ? 1 : 0) === side).length;
			seat.style.left = `${side ? 264 : 12}px`; seat.style.top = `${10 + column * 200 / Math.max(2, half)}px`;
			const nativeSeat = dialog.querySelectorAll('.tdnode')[index];
			seat.disabled = !nativeSeat;
			if (nativeSeat) bindSelectionCardInput(seat, { listen, later, cancel, activate: () => {
				if (lib.config.touchscreen) nativeSeat.dispatchEvent(new Event('touchend', { bubbles: true }));
				else nativeSeat.click();
				update(pending);
			} });
		});
		for (const button of dialog.buttons) {
			button.classList.toggle('hh-versus-recommendable', recommending && recommendation.allowed(button.link) && !chosen.some(item => get.sourceCharacter(item.link) === get.sourceCharacter(button.link)));
			button.classList.toggle('hh-versus-recommended', button === recommendedButton);
			button.classList.toggle('hh-versus-picked', chosen.includes(button));
			button.classList.toggle('hh-versus-mate-pending', button === pending && currentMate);
			button.classList.toggle('hh-versus-mate-picked', chosen.includes(button) && playerForIndex(chosen.indexOf(button)) !== game.me);
		}
	}
	function countdown() {
		if (disposed || !(remaining > 0)) return;
		const now = Date.now();
		if (!_status.paused2 && !document.hidden && isCurrent()) remaining -= now - lastTime;
		lastTime = now;
		progress.firstChild.style.width = `${Math.max(0, remaining / (event.timeout * 1000)) * 100}%`;
		if (remaining <= 0 && isCurrent()) { event.result = 'ai'; game.resume(); }
		else later(countdown, 100);
	}
	if (remaining > 0) later(countdown, 100);
	return { paintCandidate, update,
		chooseRecommendation(button) {
			if (!recommending) return false;
			if (button.classList.contains('hh-versus-recommendable') && recommendation.recommend(button.link)) recommending = false;
			update(pendingButton); return true;
		},
		selfChoice: button => recommendation?.selfChoice(button.link),
		dispose() {
		disposed = true; stopEffect();
		if (renderer) { renderer.release(model); renderer.gl.deleteBuffer(renderer.buffer); renderer.gl.deleteProgram(renderer.program); renderer.canvas.remove(); }
	} };
}
