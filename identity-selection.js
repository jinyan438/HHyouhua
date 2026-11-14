// Keep the engine's real buttons, links and chooseButton event throughout selection.
export function installIdentitySelection(lib, game, ui, get, _status) {
	if (lib._hhIdentitySelectionInstalled) return;
	lib._hhIdentitySelectionInstalled = true;
	lib.arenaReady.push(() => {
		const prototype = lib.element.Dialog.prototype;
		const open = prototype.open;
		prototype.open = function (...args) {
			const result = open.apply(this, args);
			const event = _status.event;
			const parent = event?.getParent?.('chooseCharacter');
			if (!this._hhSelection && !this.noopen && get.mode() === 'identity' &&
				!_status.connectMode && !game.online && !_status.brawl &&
				!['purple', 'stratagem'].includes(_status.mode) &&
				event?.name === 'chooseButton' && event.player === game.me && parent?.list &&
				this !== parent.dialogxx && this.buttons?.some(button => button.classList.contains('character'))) {
				mount(this, event, parent);
			}
			return result;
		};
	});

	function mount(dialog, event, parent) {
		const viewport = document.createElement('div');
		viewport.className = 'hh-identity-viewport';
		const root = document.createElement('div');
		root.className = 'hh-identity-selection';
		root.innerHTML = '<header class="hh-selection-title">选将</header><aside class="hh-selection-side"><div class="hh-seat-map"></div><div class="hh-my-identity"></div><div class="hh-identity-goal"></div><div class="hh-lord"></div></aside><main class="hh-selection-main"></main><div class="hh-selection-prompt">请选择武将</div><div class="hh-selection-progress"><i></i></div><footer class="hh-selection-footer"></footer>';
		viewport.appendChild(root);
		ui.window.appendChild(viewport);
		// Use the actual arena player, including HH overrides and the game's zoom.
		const playerTemplate = () => game.players.find(player => player !== game.me && player.node?.campWrap) || game.me;
		const matchPlayerSize = () => {
			const player = playerTemplate();
			if (!player?.node?.campWrap) return;
			const rect = player.getBoundingClientRect();
			const scale = root.getBoundingClientRect().width / 2760;
			if (!rect.width || !rect.height || !scale) return;
			root.classList.add('hh-use-player-style');
			root.style.setProperty('--hh-card-width', `${rect.width / scale}px`);
			root.style.setProperty('--hh-card-height', `${rect.height / scale}px`);
			root.style.setProperty('--hh-player-width', `${player.offsetWidth}px`);
			root.style.setProperty('--hh-player-height', `${player.offsetHeight}px`);
			root.style.setProperty('--hh-player-scale', rect.width / player.offsetWidth / scale);
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
		const listen = (node, type, callback, capture = false) => node.addEventListener(type, callback, { capture, signal: listeners.signal });
		let disposed = false, popup = null, animation = null, seenIdentity = parent._hhRevealedIdentity || '';
		let pendingButton = null, skillPanel = null;
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
			if (_status.noReplaceCharacter) return [];
			const list = lib.characterReplace[button._link] || lib.characterReplace[source(button.link)] || [];
			return [...new Set(list)].filter(name => enabled(name) && !occupied().has(source(name)));
		};
		const closePopup = () => { popup?.remove(); popup = null; };
		const closeSkills = () => {
			skillPanel?.remove();
			skillPanel = null;
			for (const button of decorated) {
				button.removeAttribute('aria-controls');
				button.removeAttribute('aria-expanded');
			}
		};
		main.appendChild(dialog);
		dialog.classList.add('hh-selection-dialog', 'fixed');
		root.classList.toggle('hh-touch', !!lib.config.touchscreen);
		if (controls) footer.appendChild(controls);
		ui.cheat?.classList.add('hh-selection-extra-control');
		ui.cheat2?.classList.add('hh-selection-extra-control');

		function paintArenaPlayer(button) {
			const template = playerTemplate();
			if (!template?.node?.campWrap) return false;
			const info = get.character(button.link);
			// A visual-only DOM tree: no player.init, skills, dynamic-skin instances or game state.
			const player = document.createElement('div');
			player.className = 'player fullskin hh-selection-player';
			player.style.fontFamily = getComputedStyle(template).fontFamily;
			player.dataset.mode = get.mode();
			player.dataset.borderLevel = ui.arena.dataset.borderLevel || lib.config.extension_HH优化_borderLevel || 'five';
			if (player.dataset.borderLevel === 'random') player.dataset.borderLevel = template.dataset.borderLevel || 'five';
			const avatar = template.node.avatar.cloneNode(false);
			avatar.classList.remove('hidden');
			avatar.style.display = '';
			avatar.style.opacity = '1';
			avatar.style.visibility = 'visible';
			avatar.setBackground(button.link, 'character');
			const camp = template.node.campWrap.cloneNode(true);
			camp.dataset.camp = info.groupBorder || info.group;
			const name = camp.querySelector('.avatar-name');
			name.innerHTML = get.slimName(button.link);
			const campName = camp.querySelector('.camp-name');
			campName.style.backgroundImage = '';
			campName.innerHTML = get.translation(info.group);
			// Reuse Decade UI's group renderer, including its onlineUI text/image distinction.
			camp.node = { campName };
			let prototype = lib.element.Player.prototype;
			while (prototype) {
				const descriptor = Object.getOwnPropertyDescriptor(prototype, 'group');
				if (descriptor?.set) {
					descriptor.set.call({ name: button.link, node: { campWrap: camp } }, info.group);
					break;
				}
				prototype = Object.getPrototypeOf(prototype);
			}
			const hpWrap = template.node.hpWrap.cloneNode(false);
			const hp = document.createElement('div');
			hp.className = 'hp';
			hp.dataset.condition = info.hp > info.maxHp / 2 ? 'high' : info.hp > info.maxHp / 3 ? 'mid' : 'low';
			if (info.maxHp > 5 || (info.hujia && info.maxHp > 3)) {
				hp.classList.add('textstyle');
				hp.innerHTML = `${get.numStr(info.hp)}<br>/<br>${get.numStr(info.maxHp)}<div></div>`;
				player.dataset.maxHp = '4';
			} else {
				player.dataset.maxHp = info.maxHp;
				for (let i = 0; i < info.maxHp; i++) {
					const jade = document.createElement('div');
					jade.classList.toggle('lost', i >= info.hp);
					hp.appendChild(jade);
				}
			}
			hpWrap.appendChild(hp);
			player.append(avatar, camp, hpWrap);
			button.classList.add('hh-arena-card');
			button.appendChild(player);
			return true;
		}

		function paintCard(button) {
			if (button._hhPainted === button.link) return;
			button._hhPainted = button.link;
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
			game.uncheck();
			button.link = name;
			button.refresh(button, name);
			decorate(button);
			game.check();
		}

		function reroll(button) {
			if (disposed || !isCurrent()) return;
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
			// The pool is maintained by identity mode; still revalidate replacement versions.
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
				card.addEventListener('click', e => { e.stopPropagation(); refreshButton(button, name); });
				card.addEventListener('keydown', e => {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); refreshButton(button, name); }
				});
			}
			root.appendChild(popup);
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
			if (!skillPanel || !pendingButton?.isConnected) return;
			const bounds = root.getBoundingClientRect();
			const anchor = pendingButton.getBoundingClientRect();
			const scale = bounds.width / root.clientWidth || 1;
			const left = (anchor.left - bounds.left) / scale;
			const right = (anchor.right - bounds.left) / scale;
			const width = skillPanel.offsetWidth, height = skillPanel.offsetHeight;
			// Keep the confirmation card clear; the reference panel sits to its left.
			const x = left - width - 20 >= 654 ? left - width - 20 : right + 20;
			skillPanel.style.left = `${Math.max(16, Math.min(x, root.clientWidth - width - 16))}px`;
			skillPanel.style.top = `${Math.max(143, Math.min((anchor.top - bounds.top) / scale - 97, 1110 - height))}px`;
		}

		function showSkills(button) {
			closeSkills();
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
			root.appendChild(panel);
			button.setAttribute('aria-controls', panel.id);
			button.setAttribute('aria-expanded', 'true');
			positionSkills();
			updateArrows();
		}

		function updateConfirmation() {
			if (pendingButton && !dialog.buttons.includes(pendingButton)) { pendingButton = null; closeSkills(); }
			for (const button of dialog.buttons) {
				const pending = button === pendingButton;
				const selected = ui.selected.buttons.includes(button);
				button.classList.toggle('hh-pending', pending);
				button.classList.toggle('hh-confirmed', selected);
				const label = button.querySelector('.hh-card-confirm');
				const text = selected ? '已选择' : '确认选择';
				if (label && label.textContent !== text) label.textContent = text;
				button.setAttribute('aria-pressed', String(pending || selected));
			}
		}

		function clearPending() {
			pendingButton = null;
			closeSkills();
			updateConfirmation();
		}

		function chooseCard(button) {
			if (disposed || !isCurrent() || root.classList.contains('hh-revealing') ||
				_status.dragged || _status.justdragged || _status.draggingtouchdialog) return;
			closePopup();
			const current = _status.event;
			if (ui.selected.buttons.includes(button)) {
				// In double-character games, a confirmed first general can still be changed.
				ui.selected.buttons.remove(button);
				button.classList.remove('selected');
				clearPending();
				game.check();
				return;
			}
			if (!button.classList.contains('selectable')) return;
			if (pendingButton !== button) {
				// Preview only. Do not touch engine selection, even when auto-confirm is enabled.
				pendingButton = button;
				updateConfirmation();
				showSkills(button);
				return;
			}
			pendingButton = null;
			closeSkills();
			ui.selected.buttons.add(button);
			button.classList.add('selected');
			const ok = game.check();
			// game.check may have already auto-confirmed. Submit exactly once otherwise.
			if (ok && _status.event === current && current.result?.confirm !== 'ok') ui.click.ok();
			updateConfirmation();
		}

		function decorate(button) {
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
			swap.textContent = '换';
			swap.title = '随机更换；长按选择同名武将';
			swap.setAttribute('aria-label', '随机更换武将，长按选择同名武将');
			button.appendChild(swap);
			const hint = document.createElement('span');
			hint.className = 'hh-variant-hint';
			hint.textContent = '长按';
			button.appendChild(hint);
			let timer, start, held = false, suppressUntil = 0, touchClickUntil = 0, moved = false;
			const stop = () => { cancel(timer); timer = null; };
			listen(button, 'pointerdown', e => {
				if (e.button !== 0 || !e.isPrimary) return;
				stop(); held = false; suppressUntil = 0; moved = false;
				start = { x: e.clientX, y: e.clientY, swap: e.target === swap };
				if (start.swap) { e.preventDefault(); e.stopPropagation(); }
				timer = later(() => {
					if (variants(button).length < 2) return;
					held = true;
					suppressUntil = Date.now() + 1000;
					showVariants(button);
				}, 500);
			}, true);
			listen(button, 'pointermove', e => {
				if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) { stop(); start = null; moved = true; }
			});
			listen(button, 'pointerleave', () => { stop(); start = null; });
			listen(button, 'pointercancel', () => { stop(); start = null; moved = true; });
			listen(button, 'pointerup', e => {
				stop();
				if (held || start?.swap) {
					e.preventDefault(); e.stopPropagation();
					suppressUntil = Date.now() + 1000;
					if (!held && start?.swap) reroll(button);
				}
				start = null;
			}, true);
			// Prevent the engine's own touch-intro timer from competing with the version picker.
			listen(button, 'mousedown', e => e.stopImmediatePropagation(), true);
			listen(button, 'touchstart', e => e.stopPropagation(), true);
			for (const type of ['click', 'touchend']) listen(button, type, e => {
				e.preventDefault(); e.stopImmediatePropagation();
				if (e.target === swap || held || Date.now() < suppressUntil) {
					if (type === 'click' && e.detail === 0 && !held && Date.now() >= suppressUntil) reroll(button);
					return;
				}
				if (moved || (type === 'click' && Date.now() < touchClickUntil)) return;
				// A tap may synthesize a mouse click; it must never count as both presses.
				if (type === 'touchend') touchClickUntil = Date.now() + 700;
				chooseCard(button);
			}, true);
			listen(button, 'keydown', e => {
				if (e.target !== button || !['Enter', ' '].includes(e.key) || e.repeat) return;
				e.preventDefault(); e.stopPropagation();
				chooseCard(button);
			});
			listen(button, 'contextmenu', e => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
			listen(swap, 'keydown', e => {
				if (e.key === 'ArrowDown') { e.preventDefault(); showVariants(button); }
			});
		}

		const roleNames = { zhu: '主公', zhong: '忠臣', mingzhong: '明忠', fan: '反贼', nei: '内奸', commoner: '平民' };
		const goals = { zhu: '目标：消灭反贼和内奸', zhong: '目标：保护主公，消灭反贼和内奸', mingzhong: '目标：保护主公，消灭反贼和内奸', fan: '目标：击败主公', nei: '目标：成为最后的生还者', commoner: '目标：存活到游戏结束' };
		function updateSide() {
			const role = game.me.identity;
			const roleName = roleNames[role] || get.translation(role);
			root.dataset.identity = role;
			identityText.textContent = `我（${roleName}）`;
			root.querySelector('.hh-identity-goal').textContent = goals[role] || '';
			const map = root.querySelector('.hh-seat-map');
			map.replaceChildren();
			// Relative seat order comes from the engine, never from hidden identity data.
			const first = game.zhu || game.players[0];
			const players = game.players.slice().sort((a, b) => get.distance(first, a, 'absolute') - get.distance(first, b, 'absolute'));
			players.forEach((player, index) => {
				const seat = document.createElement('div');
				seat.className = 'hh-seat';
				const isLord = player === game.zhu && player.identityShown;
				seat.classList.toggle('hh-seat-lord', !!isLord);
				seat.classList.toggle('hh-seat-me', player === game.me);
				const prefix = player === game.me ? '我' : isLord ? (roleNames[player.identity] || '').slice(0, 1) : '';
				seat.textContent = `${prefix ? prefix + '\n' : ''}${get.cnNumber(index + 1, true)}`;
				// Eight-seat outline follows the reference: lord at left, next seats bottom-right,
				// then ascending up the right edge and across the top from right to left.
				const points = [[8, 98], [324, 178], [324, 98]];
				for (let i = 3; i < players.length; i++) points.push([288 - (i - 3) * 240 / Math.max(1, players.length - 4), 18]);
				const point = points[index];
				seat.style.left = `${point[0]}px`;
				seat.style.top = `${point[1]}px`;
				map.appendChild(seat);
			});
			const lord = game.zhu;
			const name = lord?.identityShown && lord !== game.me ? lord.name1 : '';
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
			if (seenIdentity !== role) {
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
			for (const button of dialog.buttons) decorate(button);
			for (const container of dialog.content.querySelectorAll('.buttons')) {
				container.classList.toggle('hh-general-grid', !!container.querySelector('.hh-general'));
			}
			updateConfirmation();
			updateSide();
		}
		const observer = new MutationObserver(() => { closePopup(); sync(); });
		observer.observe(dialog.content, { childList: true, subtree: true });
		// decorate() is idempotent; attribute changes are deliberately not observed.
		sync();
		const clickAway = e => {
			if (popup && !popup.contains(e.target) && !e.target.closest('.hh-general')) closePopup();
			if (skillPanel && !skillPanel.contains(e.target) && !e.target.closest('.hh-general')) clearPending();
		};
		const escape = e => { if (e.key === 'Escape' && (popup || skillPanel)) { e.stopPropagation(); closePopup(); clearPending(); } };
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
		function cleanup() {
			if (disposed) return;
			disposed = true;
			listeners.abort();
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
			document.removeEventListener('keydown', escape, true);
			window.removeEventListener('resize', resize);
			if (controls && controlParent && controls.parentNode === footer) controlParent.insertBefore(controls, controlNext?.parentNode === controlParent ? controlNext : null);
			if (dialog.parentNode === main && originalParent) originalParent.appendChild(dialog);
			dialog.classList.remove('hh-selection-dialog');
			delete dialog._hhSelection;
			dialog.close = originalClose;
			ui.cheat?.classList.remove('hh-selection-extra-control');
			ui.cheat2?.classList.remove('hh-selection-extra-control');
			viewport.remove();
		}
	}
}
