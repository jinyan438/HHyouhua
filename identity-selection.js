import { createSelectionPlayerVisual, findSelectionPlayerTemplate, captureSelectionPlayerLayout } from './src/ui/selectionPlayer.js';
import { createSelectionFreePick } from './src/ui/selectionFreePick.js';
import { bindSelectionCardInput } from './src/ui/selectionCardInput.js';
import { createVersusSelection } from './src/ui/versusSelection.js';
import { installHappySelectionCandidates } from './src/ui/happySelectionCandidates.js';

// Keep the engine's real buttons, links and chooseButton event throughout selection.
export function installIdentitySelection(lib, game, ui, get, _status) {
	if (lib._hhIdentitySelectionInstalled) return;
	lib._hhIdentitySelectionInstalled = true;
	lib.arenaReady.push(() => {
		installHappySelectionCandidates({ lib, game, ui, get, _status });
		const prototype = lib.element.Dialog.prototype;
		const open = prototype.open;
		prototype.open = function (...args) {
			const result = open.apply(this, args);
			const event = _status.event;
			const parent = event?.name === 'chooseCharacter' ? event : event?.getParent?.('chooseCharacter');
			const mode = get.mode();
			if (!this._hhSelection && !this.noopen && ['identity', 'doudizhu', 'versus'].includes(mode) &&
				!_status.connectMode && !game.online && !_status.brawl &&
				(mode !== 'versus' || _status.mode === 'two') &&
				(mode !== 'identity' || !['purple', 'stratagem'].includes(_status.mode)) &&
				event?.name === 'chooseButton' && event.player === game.me && parent?.name === 'chooseCharacter' && (mode !== 'identity' || parent.list) &&
				this !== parent.dialogxx && this.buttons?.some(button => button.classList.contains('character'))) {
				mount(this, event, parent, mode);
			}
			return result;
		};
	});

	function mount(dialog, event, parent, mode) {
		const doudizhu = mode === 'doudizhu';
		const versus = mode === 'versus';
		const fixedChoices = versus || (doudizhu && !Array.isArray(parent.list));
		const viewport = document.createElement('div');
		viewport.className = 'hh-identity-viewport';
		const root = document.createElement('div');
		root.className = 'hh-identity-selection';
		root.classList.toggle('hh-doudizhu-selection', doudizhu);
		root.classList.toggle('hh-versus-selection', versus);
		root.dataset.mode = mode;
		root.innerHTML = '<header class="hh-selection-title">选将</header><aside class="hh-selection-side"><div class="hh-seat-map"></div><div class="hh-my-identity"></div><div class="hh-identity-goal"></div><div class="hh-lord"></div></aside><main class="hh-selection-main"></main><div class="hh-selection-prompt">请选择武将</div><div class="hh-selection-progress"><i></i></div><footer class="hh-selection-footer"></footer>';
		viewport.appendChild(root);
		ui.window.appendChild(viewport);
		// Use the actual arena player, including HH overrides and the game's zoom.
		const playerTemplate = () => findSelectionPlayerTemplate(game);
		const matchPlayerSize = () => {
			if (versus) return;
			const player = playerTemplate();
			if (!player?.node?.campWrap) return;
			const scale = root.getBoundingClientRect().width / 2760;
			const layout = captureSelectionPlayerLayout(player, scale);
			if (!layout) return;
			// Preserve the exact opening card dimensions for the catalog later in this game.
			game.hhSelectionCardLayout = layout;
			root.classList.add('hh-use-player-style');
			root.style.setProperty('--hh-card-width', `${layout.width}px`);
			root.style.setProperty('--hh-card-height', `${layout.height}px`);
			root.style.setProperty('--hh-player-width', `${layout.playerWidth}px`);
			root.style.setProperty('--hh-player-height', `${layout.playerHeight}px`);
			root.style.setProperty('--hh-player-scale', layout.playerScale);
		};
		const fit = () => {
			const scale = Math.min(viewport.clientWidth / 2760, viewport.clientHeight / 1256);
			root.style.transform = `translate(-50%, -50%) scale(${scale})`;
			matchPlayerSize();
		};
		fit();
		const sizeObserver = new ResizeObserver(() => { fit(); positionSkills(); });
		sizeObserver.observe(viewport);
		if (playerTemplate()) sizeObserver.observe(playerTemplate());
		dialog._hhSelection = root;
		const main = root.querySelector('main');
		const footer = root.querySelector('footer');
		const identityText = root.querySelector('.hh-my-identity');
		const originalParent = dialog.parentNode;
		const controlParent = ui.control?.parentNode;
		const controlNext = ui.control?.nextSibling;
		const controls = ui.control;
		const timers = new Set();
		const listeners = new AbortController();
		const decorated = new Set();
		const extraControls = new Set();
		const listen = (node, type, callback, capture = false) => node.addEventListener(type, callback, { capture, signal: listeners.signal });
		let disposed = false, popup = null, animation = null, seenIdentity = parent._hhRevealedIdentity || '';
		let pendingButton = null, skillPanel = null, skillButton = null;
		let lordName = '';
		const later = (callback, delay) => {
			const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, delay);
			timers.add(timer);
			return timer;
		};
		const cancel = timer => { clearTimeout(timer); timers.delete(timer); };
		const source = name => get.sourceCharacter(name);
		const isCurrent = () => _status.event?.name === 'chooseButton' && _status.event.dialog === dialog && _status.event.player === game.me;
		const enabled = name => !!lib.character[name] && !lib.filter.characterDisabled(name);
		const occupied = () => new Set(game.players.filter(p => p !== game.me).flatMap(p => [p.name1, p.name2]).filter(Boolean).map(source));
		const variants = button => {
			if (_status.noReplaceCharacter || fixedChoices) return [];
			const list = lib.characterReplace[button._link] || lib.characterReplace[source(button.link)] || [];
			return [...new Set(list)].filter(name => enabled(name) && !occupied().has(source(name)));
		};
		const closePopup = () => { popup?.remove(); popup = null; };
		const closeSkills = () => {
			skillPanel?.remove();
			skillPanel = null;
			skillButton?.removeAttribute('aria-controls');
			skillButton?.removeAttribute('aria-expanded');
			skillButton = null;
			for (const button of decorated) {
				button.removeAttribute('aria-controls');
				button.removeAttribute('aria-expanded');
			}
		};
		const originalFilter = event.filterButton;
		// Keep native candidate restrictions, including reserved teammate cards.
		const pickedButtons = new Set();
		let pointCard = null;
		const pointSlot = document.createElement('div');
		pointSlot.className = 'hh-point-slot';
		const pointEntry = document.createElement('button');
		pointEntry.type = 'button'; pointEntry.className = 'hh-point-entry'; pointEntry.textContent = '点将';
		pointEntry.setAttribute('aria-label', '点将，任选武将');
		pointSlot.hidden = versus;
		pointSlot.appendChild(pointEntry);
		const available = name => {
			if (!lib.character[name]) return false;
			const info = get.character(name);
			if (info.isUnseen || info.trashBin?.includes('unseen') || occupied().has(source(name))) return false;
			// A fixed teammate's pool remains reserved for that teammate.
			return !dialog.buttons.some(button => typeof button.link === 'string' && !pickedButtons.has(button) &&
				source(button.link) === source(name) && !originalFilter.call(event, button, game.me));
		};
		const pointFilter = function (button, ...args) {
			return pickedButtons.has(button) ? available(button.link) : originalFilter?.call(this, button, ...args) ?? true;
		};
		event.filterButton = pointFilter;
		const picker = createSelectionFreePick({ lib, ui, get }, {
			root, available: name => available(name) && !ui.selected.buttons.some(button => source(button.link) === source(name)),
			paintCard, onPick: pickGeneral, onPreview: showSkills, onClearPreview: closeSkills, onPosition: positionSkills,
		});
		listen(pointEntry, 'click', e => {
			e.stopPropagation();
			if (disposed || !isCurrent() || picker.isOpen || root.classList.contains('hh-revealing')) return;
			clearPending(); closePopup(); picker.open();
		});
		function pickGeneral(name) {
			if (disposed || !isCurrent() || !available(name)) return;
			const existing = dialog.buttons.find(button => button.link === name && event.filterButton(button, game.me));
			if (existing) { existing.focus({ preventScroll: true }); chooseCard(existing, true); return; }
			clearPending();
			if (pointCard && ui.selected.buttons.includes(pointCard)) {
				// Keep a confirmed first general when picking a second one in double-character games.
				pointSlot.parentNode.insertBefore(pointCard, pointSlot); pointCard = null;
			}
			if (pointCard) {
				dialog.buttons.splice(dialog.buttons.indexOf(pointCard), 1); pickedButtons.delete(pointCard); pointCard.remove();
			}
			pointCard = ui.create.button(name, 'character');
			pickedButtons.add(pointCard); dialog.buttons.push(pointCard); pointSlot.insertBefore(pointCard, pointEntry);
			pointSlot.classList.add('hh-point-filled'); decorate(pointCard);
			// Refresh the native legality cache without clearing a confirmed first general.
			delete event._buttonChoice; game.check();
			pointCard.focus({ preventScroll: true }); chooseCard(pointCard, true);
		}
		main.appendChild(dialog);
		dialog.classList.add('hh-selection-dialog', 'fixed');
		root.classList.toggle('hh-touch', !!lib.config.touchscreen);
		if (controls) footer.appendChild(controls);
		ui.cheat?.classList.add('hh-selection-extra-control');
		ui.cheat2?.classList.add('hh-selection-extra-control');
		const versusView = versus ? createVersusSelection({ lib, game, ui, get, _status }, {
			root, dialog, event, parent, listen, later, cancel, isCurrent,
			onChoose: button => chooseCard(button),
			onInspect: button => showSkills(button),
			paintPreview: button => {
				paintCard(button, true);
				const template = playerTemplate();
				if (template?.offsetWidth && template.offsetHeight) {
					button.style.setProperty('--hh-player-width', `${template.offsetWidth}px`);
					button.style.setProperty('--hh-player-height', `${template.offsetHeight}px`);
					button.style.setProperty('--hh-player-scale', 440 / template.offsetHeight);
					button.style.setProperty('--hh-preview-width', `${440 * template.offsetWidth / template.offsetHeight}px`);
				}
			},
		}) : null;

		function paintArenaPlayer(button) {
			const template = playerTemplate();
			if (!template?.node?.campWrap) return false;
			const player = createSelectionPlayerVisual({ lib, game, ui, get }, button.link, { template });
			button.classList.add('hh-arena-card');
			button.appendChild(player);
			return true;
		}

		function paintCard(button, preview = false) {
			if (button._hhPainted === button.link) return;
			button._hhPainted = button.link;
			if (versus && !preview) {
				versusView.paintCandidate(button);
				return;
			}
			button.querySelector('.hh-card-details')?.remove();
			button.querySelector('.hh-selection-player')?.remove();
			if (paintArenaPlayer(button)) return;
			const info = get.character(button.link);
			const rarity = game.getRarity(button.link);
			button.dataset.hhFrame = ['legend', 'epic'].includes(rarity) ? 'gold' : rarity === 'rare' ? 'silver' : 'common';
			const details = document.createElement('div');
			details.className = 'hh-card-details';
			const group = document.createElement('span');
			group.className = 'hh-card-group';
			group.dataset.group = info.group;
			group.textContent = get.translation(info.group);
			const name = document.createElement('span');
			name.className = 'hh-card-name';
			const text = document.createElement('span');
			text.innerHTML = get.slimName(button.link);
			const label = text.textContent;
			const prefix = label.match(/^(界|SP|OL|谋|神)/)?.[0];
			if (prefix) {
				const version = document.createElement('b');
				version.textContent = prefix;
				name.append(version, label.slice(prefix.length));
			} else name.textContent = label;
			const hp = document.createElement('span');
			hp.className = 'hh-card-hp';
			if (info.maxHp > 5) {
				hp.innerHTML = '<i></i>';
				const count = document.createElement('span');
				count.textContent = `${info.hp}/${info.maxHp}`;
				hp.appendChild(count);
			} else {
				for (let i = 0; i < info.maxHp; i++) {
					const jade = document.createElement('i');
					jade.classList.toggle('hh-hp-lost', i >= info.hp);
					hp.appendChild(jade);
				}
			}
			details.append(group, name, hp);
			button.appendChild(details);
		}

		function refreshButton(button, name) {
			clearPending();
			closePopup();
			ui.selected.buttons.remove(button);
			button.classList.remove('selected');
			button.link = name;
			button.refresh(button, name);
			delete event._buttonChoice;
			decorate(button);
			game.check();
			button.focus({ preventScroll: true });
			chooseCard(button);
		}

		function reroll(button) {
			if (disposed || !isCurrent() || !Array.isArray(parent.list) || !button.classList.contains('selectable')) return;
			clearPending();
			const used = occupied();
			for (const other of dialog.buttons) used.add(source(other.link));
			const pool = [...new Set(parent.list)].filter(name => {
				if (used.has(source(name))) return false;
				return (lib.characterReplace[name] || [name]).some(enabled);
			});
			if (!pool.length) return;
			closePopup();
			const name = pool[Math.floor(Math.random() * pool.length)];
			const next = ui.create.button(name, 'characterx');
			// The pool is maintained by the mode; still revalidate replacement versions.
			if (!enabled(next.link)) {
				next.link = (lib.characterReplace[name] || [name]).find(enabled);
				next.refresh(next, next.link);
			}
			game.uncheck();
			const index = dialog.buttons.indexOf(button);
			if (index < 0) return;
			dialog.buttons[index] = next;
			button.replaceWith(next);
			decorate(next);
			game.check();
		}

		function showVariants(button) {
			clearPending();
			closePopup();
			const list = variants(button);
			if (list.length < 2 || !isCurrent()) return;
			popup = document.createElement('div');
			popup.className = 'hh-variant-panel';
			popup.setAttribute('role', 'dialog');
			popup.setAttribute('aria-label', '同名武将');
			const close = document.createElement('button');
			close.className = 'hh-variant-close';
			close.textContent = '×';
			close.setAttribute('aria-label', '关闭');
			close.onclick = closePopup;
			popup.appendChild(close);
			for (const name of list) {
				const card = ui.create.button(name, 'character', popup, true);
				card.classList.add('hh-general');
				paintCard(card);
				card.classList.toggle('hh-current', name === button.link);
				card.setAttribute('role', 'button');
				card.tabIndex = 0;
				card.setAttribute('aria-label', get.translation(name));
				bindSelectionCardInput(card, { activate: () => refreshButton(button, name), listen, later, cancel });
			}
			root.appendChild(popup);
			for (const type of ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel']) {
				popup.addEventListener(type, e => e.stopPropagation());
			}
			// Coordinates are converted to the game window's CSS space (which can be zoomed).
			const bounds = root.getBoundingClientRect();
			const anchor = button.getBoundingClientRect();
			const scale = bounds.width / root.clientWidth || 1;
			const width = popup.offsetWidth, height = popup.offsetHeight;
			const x = (anchor.right - bounds.left) / scale + 16;
			const y = (anchor.top - bounds.top) / scale;
			popup.style.left = `${Math.max(12, Math.min(x, root.clientWidth - width - 16))}px`;
			popup.style.top = `${Math.max(68, Math.min(y, root.clientHeight - height - 74))}px`;
		}

		function positionSkills() {
			if (!skillPanel || !skillButton?.isConnected) return;
			const host = skillPanel.parentNode, inPicker = host !== root;
			const bounds = host.getBoundingClientRect();
			const anchor = skillButton.getBoundingClientRect();
			const scale = bounds.width / host.clientWidth || 1;
			const left = (anchor.left - bounds.left) / scale;
			const right = (anchor.right - bounds.left) / scale;
			const width = skillPanel.offsetWidth, height = skillPanel.offsetHeight;
			// Keep the confirmation card clear; the reference panel sits to its left.
			const x = left - width - 20 >= (inPicker || doudizhu ? 16 : 654) ? left - width - 20 : right + 20;
			skillPanel.style.left = `${Math.max(16, Math.min(x, host.clientWidth - width - 16))}px`;
			skillPanel.style.top = `${Math.max(inPicker ? 112 : 143, Math.min((anchor.top - bounds.top) / scale - 97, (inPicker ? host.clientHeight - 16 : 1110) - height))}px`;
		}

		function showSkills(button, host = root) {
			closeSkills();
			skillButton = button;
			const panel = document.createElement('div');
			skillPanel = panel;
			panel.className = 'hh-skill-panel';
			panel.id = 'hh-selection-skills';
			panel.setAttribute('role', 'dialog');
			panel.setAttribute('aria-label', `${get.translation(button.link)}技能`);
			const content = document.createElement('div');
			content.className = 'hh-skill-content';
			content.tabIndex = 0;
			for (const skill of new Set(get.character(button.link).skills || [])) {
				const description = get.skillInfoTranslation(skill, null, false);
				if (!description) continue;
				const section = document.createElement('section');
				section.className = 'hh-skill-entry';
				const title = document.createElement('h3');
				title.className = 'hh-skill-title';
				title.textContent = get.translation(skill);
				const body = document.createElement('div');
				body.className = 'hh-skill-description';
				const badge = document.createElement('span');
				badge.className = 'hh-skill-type';
				badge.textContent = lib.skill[skill]?.enable ? '主' : '被';
				badge.setAttribute('aria-label', lib.skill[skill]?.enable ? '主动技能' : '被动技能');
				const text = document.createElement('span');
				text.innerHTML = description;
				body.append(badge, text);
				section.append(title, body);
				if (lib.translate[`${skill}_append`]) {
					const appendix = document.createElement('div');
					appendix.className = 'hh-skill-append';
					appendix.innerHTML = lib.translate[`${skill}_append`];
					section.appendChild(appendix);
				}
				content.appendChild(section);
			}
			if (!content.childElementCount) content.textContent = '暂无技能';
			const arrows = [-1, 1].map(direction => {
				const arrow = document.createElement('button');
				arrow.type = 'button';
				arrow.className = `hh-skill-scroll hh-skill-scroll-${direction < 0 ? 'up' : 'down'}`;
				arrow.setAttribute('aria-label', direction < 0 ? '向上查看技能' : '向下查看技能');
				arrow.addEventListener('click', () => content.scrollBy({ top: direction * content.clientHeight * .7, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
				return arrow;
			});
			const updateArrows = () => {
				arrows[0].hidden = content.scrollTop <= 1;
				arrows[1].hidden = content.scrollTop + content.clientHeight >= content.scrollHeight - 1;
			};
			content.addEventListener('scroll', updateArrows);
			// Retain native wheel/touch scrolling without starting the arena's gestures.
			for (const type of ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel']) {
				panel.addEventListener(type, e => e.stopPropagation());
			}
			panel.append(content, ...arrows);
			host.appendChild(panel);
			button.setAttribute('aria-controls', panel.id);
			button.setAttribute('aria-expanded', 'true');
			positionSkills();
			updateArrows();
		}

		function updateConfirmation() {
			if (pendingButton && !dialog.buttons.includes(pendingButton)) { pendingButton = null; closeSkills(); }
			for (const button of dialog.buttons) {
				if (!button.classList.contains('hh-general')) continue;
				const pending = button === pendingButton;
				const selected = ui.selected.buttons.includes(button);
				button.classList.toggle('hh-pending', pending);
				button.classList.toggle('hh-confirmed', selected);
				const label = button.querySelector('.hh-card-confirm');
				const text = selected ? '已选择' : '确认选择';
				if (label && label.textContent !== text) label.textContent = text;
				button.setAttribute('aria-pressed', String(pending || selected));
			}
			versusView?.update(pendingButton);
		}

		function clearPending() {
			pendingButton = null;
			closeSkills();
			updateConfirmation();
		}

		function chooseCard(button, confirm = false) {
			// Card movement is checked by our gesture handler, independently of native drag state.
			if (disposed || !isCurrent() || picker.isOpen || root.classList.contains('hh-revealing')) return;
			closePopup();
			if (versusView?.chooseRecommendation(button)) return;
			const current = _status.event;
			if (ui.selected.buttons.includes(button)) {
				// In double-character games, a confirmed first general can still be changed.
				ui.selected.buttons.remove(button);
				button.classList.remove('selected');
				clearPending();
				game.check();
				return;
			}
			if (!button.classList.contains('selectable') || button.classList.contains('unselectable') || button.classList.contains('noclick')) return;
			if (pendingButton !== button && !confirm) {
				// Preview only. Do not touch engine selection, even when auto-confirm is enabled.
				pendingButton = button;
				updateConfirmation();
				showSkills(button);
				return;
			}
			pendingButton = null;
			closeSkills();
			versusView?.selfChoice(button);
			ui.selected.buttons.add(button);
			button.classList.add('selected');
			const ok = game.check();
			// game.check may have already auto-confirmed. Submit exactly once otherwise.
			if (ok && _status.event === current && current.result?.confirm !== 'ok') ui.click.ok();
			updateConfirmation();
		}

		function decorate(button) {
			if (!button.classList.contains('character') || typeof button.link !== 'string') return;
			button.classList.add('hh-general');
			paintCard(button);
			button.classList.toggle('hh-has-variants', variants(button).length > 1);
			if (button._hhDecorated) return;
			button._hhDecorated = true;
			decorated.add(button);
			button.tabIndex = 0;
			button.setAttribute('role', 'button');
			const confirmation = document.createElement('span');
			confirmation.className = 'hh-card-confirm';
			confirmation.textContent = '确认选择';
			button.appendChild(confirmation);
			const swap = document.createElement('button');
			swap.className = 'hh-general-swap';
			swap.hidden = fixedChoices || pickedButtons.has(button);
			swap.textContent = '换';
			swap.title = '随机更换；长按选择同名武将';
			swap.setAttribute('aria-label', '随机更换武将，长按选择同名武将');
			button.appendChild(swap);
			const hint = document.createElement('span');
			hint.className = 'hh-variant-hint';
			hint.textContent = '长按';
			button.appendChild(hint);
			bindSelectionCardInput(button, {
				activate: () => chooseCard(button), swap, reroll: () => reroll(button), listen, later, cancel,
				hold: () => {
					if (variants(button).length < 2 || !isCurrent()) return false;
					showVariants(button); return true;
				},
			});
		}

		const roleNames = doudizhu ? { zhu: '地主', fan: '农民' } : { zhu: '主公', zhong: '忠臣', mingzhong: '明忠', fan: '反贼', nei: '内奸', commoner: '平民' };
		const goals = doudizhu ? { zhu: '目标：击败两名农民', fan: '目标：与队友合力击败地主' } : { zhu: '目标：消灭反贼和内奸', zhong: '目标：保护主公，消灭反贼和内奸', mingzhong: '目标：保护主公，消灭反贼和内奸', fan: '目标：击败主公', nei: '目标：成为最后的生还者', commoner: '目标：存活到游戏结束' };
		function updateSide() {
			if (versus) { versusView.update(pendingButton); return; }
			const role = game.me.identity;
			const roleName = roleNames[role] || get.translation(role);
			root.dataset.identity = role;
			identityText.textContent = `我（${roleName}）`;
			if (doudizhu) {
				const prompt = root.querySelector('.hh-selection-prompt'); prompt.replaceChildren('您是');
				const roleText = document.createElement('strong'); roleText.textContent = roleName; prompt.appendChild(roleText);
				const count = get.select?.(event.selectButton)?.[1] || 1;
				prompt.append(count > 1 && count < Infinity ? `，请选择${get.cnNumber(count)}名武将` : '，请选择武将');
			}
			root.querySelector('.hh-identity-goal').textContent = goals[role] || '';
			const map = root.querySelector('.hh-seat-map');
			map.replaceChildren();
			// Relative seat order comes from the engine, never from hidden identity data.
			const first = game.zhu || game.players[0];
			const players = game.players.slice().sort((a, b) => get.distance(first, a, 'absolute') - get.distance(first, b, 'absolute'));
			const myIndex = players.indexOf(game.me);
			players.forEach((player, index) => {
				const seat = document.createElement('div');
				seat.className = 'hh-seat';
				const isLord = player === game.zhu && (doudizhu || player.identityShown);
				seat.classList.toggle('hh-seat-lord', !!isLord);
				seat.classList.toggle('hh-seat-me', player === game.me);
				const prefix = player === game.me ? '我' : isLord ? (roleNames[player.identity] || '').slice(0, 1) : '';
				seat.textContent = `${!doudizhu && prefix ? prefix + '\n' : ''}${get.cnNumber(index + 1, true)}`;
				// Eight-seat outline follows the reference: lord at left, next seats bottom-right,
				// then ascending up the right edge and across the top from right to left.
				const points = [[8, 98], [324, 178], [324, 98]];
				for (let i = 3; i < players.length; i++) points.push([288 - (i - 3) * 240 / Math.max(1, players.length - 4), 18]);
				const landlordPoints = game.me === game.zhu ? [[252, 150], [199, 17], [88, 17]] : [[252, 150], [170, 17], [52, 85]];
				const point = doudizhu ? landlordPoints[(index - myIndex + players.length) % players.length] : points[index];
				seat.style.left = `${point[0]}px`;
				seat.style.top = `${point[1]}px`;
				map.appendChild(seat);
			});
			const lord = game.zhu;
			const name = !doudizhu && lord?.identityShown && lord !== game.me ? lord.name1 : '';
			if (lordName !== name) {
				lordName = name;
				const area = root.querySelector('.hh-lord');
				area.replaceChildren();
				if (name && lib.character[name]) {
					const card = ui.create.button(name, 'character', area, true);
					card.classList.add('hh-general');
					paintCard(card);
					const label = document.createElement('div');
					label.className = 'hh-lord-label';
					label.textContent = `${roleNames[lord.identity] || '主公'}已选`;
					area.appendChild(label);
				}
			}
			if (!doudizhu && seenIdentity !== role) {
				seenIdentity = role;
				parent._hhRevealedIdentity = role;
				reveal(role, roleName);
			}
		}

		function reveal(role, roleName) {
			root.querySelector('.hh-identity-reveal')?.remove();
			animation?.cancel();
			const reveal = document.createElement('div');
			reveal.className = 'hh-identity-reveal';
			const card = document.createElement('div');
			card.className = 'hh-identity-card';
			const artwork = document.createElement('img');
			artwork.className = 'hh-identity-artwork';
			artwork.alt = roleName;
			const identity = role === 'mingzhong' ? 'zhong' : role;
			// Clip the original sheet without repainting or stretching its card faces.
			const crop = { zhu: [31, 28], zhong: [331, 28], fan: [31, 425], nei: [331, 425] }[identity];
			if (crop) {
				card.classList.add('hh-identity-card-cropped');
				artwork.src = `${lib.assetURL}extension/HH优化/assets/selection/identity-sheet.png`;
				artwork.style.width = `${600 / 239 * 100}%`;
				artwork.style.left = `${-crop[0] / 239 * 100}%`;
				artwork.style.top = `${-crop[1] / 342 * 100}%`;
			} else {
				artwork.src = `${lib.assetURL}image/card/identity_${identity}.jpg`;
			}
			card.appendChild(artwork);
			const text = document.createElement('div');
			text.className = 'hh-identity-announcement';
			text.append('你的身份是');
			const strong = document.createElement('strong');
			strong.textContent = roleName;
			text.appendChild(strong);
			reveal.append(card, text);
			root.appendChild(reveal);
			root.classList.add('hh-revealing');
			const token = role;
			later(() => {
				if (token !== seenIdentity || !reveal.isConnected) return;
				const from = card.getBoundingClientRect();
				const to = identityText.getBoundingClientRect();
				const scale = root.getBoundingClientRect().width / root.clientWidth || 1;
				const dx = (to.left + to.width / 2 - from.left - from.width / 2) / scale;
				const dy = (to.top + to.height / 2 - from.top - from.height / 2) / scale;
				text.classList.add('hh-fade');
				const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				animation = card.animate([
					{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
					{ transform: `translate(${dx}px, ${dy}px) scale(.09)`, opacity: 0.15 }
				], { duration: reduced ? 1 : 800, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
				animation.onfinish = () => {
					if (disposed || token !== seenIdentity) return;
					reveal.remove();
					root.classList.remove('hh-revealing');
				};
			}, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1050);
		}

		function sync() {
			if (disposed) return;
			if (versus) for (const control of [ui.cheat, ui.cheat2].filter(Boolean)) {
				control.classList.add('hh-selection-extra-control'); extraControls.add(control);
			}
			for (const button of dialog.buttons) decorate(button);
			for (const container of dialog.content.querySelectorAll('.buttons')) {
				container.classList.toggle('hh-general-grid', !!container.querySelector('.hh-general'));
			}
			const grid = dialog.content.querySelector('.hh-general-grid');
			if (!versus && grid && pointSlot.parentNode !== grid) grid.appendChild(pointSlot);
			updateConfirmation();
			updateSide();
		}
		const observer = new MutationObserver(() => { closePopup(); sync(); });
		observer.observe(dialog.content, { childList: true, subtree: true });
		// decorate() is idempotent; attribute changes are deliberately not observed.
		sync();
		const clickAway = e => {
			if (picker.isOpen) { picker.clearPreview(); return; }
			if (popup && !popup.contains(e.target) && !e.target.closest('.hh-general')) closePopup();
			if (skillPanel && !skillPanel.contains(e.target) && !e.target.closest('.hh-general') && !e.target.closest('.hh-versus-preview') && !e.target.closest('.hh-versus-recommend')) clearPending();
		};
		const escape = e => {
			if (e.key !== 'Escape') return;
			if (picker.isOpen) { e.preventDefault(); e.stopImmediatePropagation(); picker.close(); }
			else if (popup || skillPanel) { e.stopPropagation(); closePopup(); clearPending(); }
		};
		root.addEventListener('pointerdown', clickAway);
		document.addEventListener('keydown', escape, true);
		const resize = () => { closePopup(); fit(); positionSkills(); };
		window.addEventListener('resize', resize);
		listen(dialog.querySelector('.content-container'), 'scroll', positionSkills);
		const originalClose = dialog.close;
		dialog.close = function (...args) { cleanup(); return originalClose.apply(this, args); };
		// Covers auto-selection/restart paths which delete a dialog instead of closing it.
		const lifetime = new MutationObserver(() => { if (!root.isConnected || !root.contains(dialog)) cleanup(); });
		lifetime.observe(ui.window, { childList: true, subtree: true });
		const onChoiceEnd = (current, option) => {
			if (option?.state === 'end' && current.result && current.result !== 'ai') cleanup();
		};
		if (versus) event.pushHandler?.(onChoiceEnd);
		function cleanup() {
			if (disposed) return;
			disposed = true;
			if (versus) {
				const handlers = event.getHandler?.();
				// Native dispatch iterates this array with forEach; remove after dispatch
				// so another extension's following handler is not skipped.
				Promise.resolve().then(() => {
					const index = handlers?.indexOf(onChoiceEnd) ?? -1;
					if (index >= 0) handlers.splice(index, 1);
				});
			}
			listeners.abort();
			picker.close(false);
			if (event.filterButton === pointFilter) event.filterButton = originalFilter;
			for (const button of pickedButtons) {
				const index = dialog.buttons.indexOf(button); if (index >= 0) dialog.buttons.splice(index, 1);
				button.remove();
			}
			pointSlot.remove(); delete event._buttonChoice;
			for (const button of decorated) {
				delete button._hhDecorated;
				button.querySelector('.hh-general-swap')?.remove();
				button.querySelector('.hh-variant-hint')?.remove();
				button.querySelector('.hh-card-confirm')?.remove();
				button.classList.remove('hh-pending', 'hh-confirmed');
				button.removeAttribute('aria-pressed');
			}
			observer.disconnect(); lifetime.disconnect();
			sizeObserver.disconnect();
			timers.forEach(clearTimeout); timers.clear();
			animation?.cancel(); closePopup(); closeSkills();
			versusView?.dispose();
			document.removeEventListener('keydown', escape, true);
			window.removeEventListener('resize', resize);
			if (controls && controlParent && controls.parentNode === footer) controlParent.insertBefore(controls, controlNext?.parentNode === controlParent ? controlNext : null);
			if (dialog.parentNode === main && originalParent) originalParent.appendChild(dialog);
			dialog.classList.remove('hh-selection-dialog');
			delete dialog._hhSelection;
			dialog.close = originalClose;
			ui.cheat?.classList.remove('hh-selection-extra-control');
			ui.cheat2?.classList.remove('hh-selection-extra-control');
			for (const control of extraControls) control.classList.remove('hh-selection-extra-control');
			viewport.remove();
		}
	}
}
