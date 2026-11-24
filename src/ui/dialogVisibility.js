const dialogSelector = ".dialog, .skill-dialog, .dui-dialog, .confirm-box, .popup-container";
const legacyLabels = new Set(["隐藏窗口", "显示窗口", "隐藏弹窗", "显示弹窗"]);

export function setupDialogVisibility({ game, ui, _status }, doc = document) {
	if (game.hhDialogVisibility) return game.hhDialogVisibility;
	const states = new Map(), closed = new WeakSet(), legacyControls = new Set();
	const view = doc.defaultView;
	let control = null, current = null, sequence = 0;
	const restoreParts = state => {
		for (const [part, original] of state.parts) {
			for (const [property, value, priority] of original.styles) {
				if (value) part.style.setProperty(property, value, priority);
				else part.style.removeProperty(property);
			}
			part.inert = original.inert;
		}
		state.parts.clear();
	};
	const concealParts = state => {
		for (const part of state.dialog.children) {
			if (part === control) continue;
			if (!state.parts.has(part)) state.parts.set(part, {
				inert: part.inert,
				styles: ["transition", "opacity", "visibility", "pointer-events"].map(property =>
					[property, part.style.getPropertyValue(property), part.style.getPropertyPriority(property)]),
			});
			for (const [property, value] of [["transition", "none"], ["opacity", "0"], ["visibility", "hidden"], ["pointer-events", "none"]]) {
				if (part.style.getPropertyValue(property) !== value || part.style.getPropertyPriority(property) !== "important") part.style.setProperty(property, value, "important");
			}
			part.inert = true;
		}
	};
	const hostFor = dialog => {
		if (!dialog?.classList || !dialog.appendChild) return null;
		let host = dialog;
		for (let parent = dialog.parentElement; parent && parent !== ui.arena && parent !== ui.window && parent !== doc.body; parent = parent.parentElement) {
			if (parent.matches(dialogSelector)) host = parent;
		}
		return host;
	};
	const expand = state => {
		state.collapsed = false;
		state.dialog.classList.remove("hh-dialog-collapsed");
		restoreParts(state);
	};
	const closeControl = () => {
		control?.close();
		control?.remove();
		control = null;
	};
	const release = dialog => {
		const state = states.get(dialog);
		if (!state) return;
		restoreParts(state);
		if (current === state) { current = null; closeControl(); }
		dialog.classList.remove("hh-dialog-toggle-host", "hh-dialog-collapsed", "hh-dialog-has-close");
		states.delete(dialog);
	};
	const hasContent = dialog => {
		if (!dialog) return false;
		if (dialog.matches(".hh-source-move-dialog, .confirm-box.guan-xing")) return true;
		// A dialog shell, prompt or confirmation button is not a choice area.
		return Array.from(dialog.querySelectorAll(".card, .button, .textbutton")).some(node =>
			!node.closest(".control, .controls") && (node.classList.contains("card") ||
				!node.matches(".ok, .cancel, .close") && node.link !== undefined));
	};
	const attach = (dialog, reset = false) => {
		const host = hostFor(dialog);
		if (!host || host === ui.arena || host === ui.window || host === doc.body) return;
		if (reset) closed.delete(host);
		if (closed.has(host)) return;
		if (!hasContent(host)) { release(host); return; }
		let state = states.get(host);
		if (!state) {
			// A containing popup owns the toggle for its nested dialogs as well.
			for (const existing of states.keys()) if (host.contains(existing)) release(existing);
			for (const child of Array.from(host.children)) if (child.classList.contains("hh-dialog-toggle")) child.remove();
			for (const stale of host.querySelectorAll(".hh-dialog-toggle-control")) if (stale !== control) stale.remove();
			state = { dialog: host, collapsed: false, parts: new Map(), order: ++sequence };
			host.classList.add("hh-dialog-toggle-host");
			states.set(host, state);
			expand(state);
		} else if (reset) { state.order = ++sequence; expand(state); }
		if (state.collapsed) concealParts(state);
		host.classList.toggle("hh-dialog-has-close", !!host.querySelector(".close, .close-button, .close-btn, [aria-label='关闭']"));
		return current === state ? control?.firstElementChild : null;
	};
	const visible = state => {
		for (let node = state.dialog; node; node = node.parentElement) {
			if (node.classList.contains("hidden") || node.classList.contains("removing")) return false;
		}
		return state.dialog.isConnected && state.dialog.getClientRects().length > 0 && view.getComputedStyle(state.dialog).visibility !== "hidden";
	};
	const updateLabel = () => {
		if (!control || !current) return;
		const button = control.firstElementChild, text = current.collapsed ? "显示窗口" : "隐藏窗口";
		if (button.textContent !== text) button.textContent = text;
		button.link = text;
		button.setAttribute("aria-label", text);
		button.setAttribute("aria-expanded", String(!current.collapsed));
	};
	const toggle = () => {
		if (!current || !visible(current)) return;
		if (current.collapsed) expand(current);
		else {
			current.collapsed = true;
			current.dialog.classList.add("hh-dialog-collapsed");
			concealParts(current);
		}
		updateLabel();
	};
	const renderControl = () => {
		const next = Array.from(states.values()).filter(visible).sort((a, b) => b.order - a.order)[0] || null;
		if (!next || !ui.control) { current = null; closeControl(); return; }
		if (current !== next && control) control._doubleclick = false;
		current = next;
		if (!control?.isConnected || !control.firstElementChild?.classList.contains("hh-dialog-toggle")) {
			control?.close();
			control = ui.create.control("隐藏窗口", toggle);
			control.classList.add("hh-dialog-toggle-control");
			const button = control.firstElementChild;
			button.classList.add("hh-dialog-toggle");
			button.tabIndex = 0;
			button.setAttribute("role", "button");
			button.addEventListener("keydown", event => {
				if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggle(); }
			});
			// Native controls already choose the correct mouse/touch event.
			for (const type of ["touchend", "click", "dblclick"]) control.addEventListener(type, event => {
				event.stopPropagation();
				_status.clicked = false;
			});
		}
		const host = current.dialog;
		const inline = !ui.arena?.contains(host) || host.contains(ui.control) || host.classList.contains("popup-container") ||
			(Number.parseInt(view.getComputedStyle(host).zIndex) || 0) > (Number.parseInt(view.getComputedStyle(ui.control).zIndex) || 0);
		control.classList.toggle("hh-dialog-toggle-inline", inline);
		const parent = inline ? host : ui.control;
		if (control.parentElement !== parent) {
			if (inline) parent.appendChild(control);
			else parent.insertBefore(control, ui.confirm?.parentElement === parent ? ui.confirm : null);
		}
		updateLabel();
	};
	const sync = (scan = false) => {
		for (const dialog of states.keys()) {
			if (!dialog.isConnected) release(dialog);
			else attach(dialog);
		}
		if (scan) for (const dialog of doc.querySelectorAll(dialogSelector)) attach(dialog);
		const active = _status.event?.dialog;
		if (active?.isConnected) attach(active);
		if (ui.dialog?.isConnected) attach(ui.dialog);
		renderControl();
		// Leave event-owned controls in place for native cleanup, while showing
		// just one visibility toggle instead of two different buttons.
		for (const control of legacyControls) if (!control.isConnected) legacyControls.delete(control);
		for (const control of ui.control?.querySelectorAll(".control") || []) {
			if (!control.classList.contains("hh-dialog-toggle-control") && legacyLabels.has(control.textContent.trim())) legacyControls.add(control);
		}
		for (const control of legacyControls) control.classList.toggle("hh-dialog-legacy-toggle", !!current);
	};
	const observer = view?.MutationObserver ? new view.MutationObserver(records => {
		const active = _status.event?.dialog;
		if ((active?.isConnected && !states.has(hostFor(active)) && hasContent(hostFor(active))) || records.some(record =>
			(record.type === "childList" && record.target.nodeType === 1 && record.target.closest(dialogSelector)) ||
			(record.type === "attributes" && (states.has(record.target) || current && record.target.contains(current.dialog))) ||
			(record.target === control && record.removedNodes.length > 0) ||
			(states.get(record.target)?.collapsed && record.addedNodes.length > 0) ||
			Array.from(record.addedNodes).some(node => node.nodeType === 1 &&
				(node.matches(dialogSelector + ", .control") || node.querySelector(dialogSelector + ", .control"))) ||
			Array.from(record.removedNodes).some(node => node.nodeType === 1 &&
				(node === control || control && node.contains(control) || Array.from(states.values()).some(state => node === state.dialog || node.contains(state.dialog)))))) sync(true);
	}) : null;
	observer?.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
	ui.updates.push(sync);
	const controller = {
		attach,
		close(dialog) { if (states.has(dialog)) { closed.add(dialog); release(dialog); } },
		get button() { return control?.firstElementChild || null; },
		sync: () => sync(true),
		dispose() {
			observer?.disconnect();
			current = null;
			closeControl();
			const index = ui.updates.indexOf(sync);
			if (index !== -1) ui.updates.splice(index, 1);
			for (const dialog of states.keys()) release(dialog);
			for (const control of legacyControls) control.classList.remove("hh-dialog-legacy-toggle");
			legacyControls.clear();
			delete game.hhDialogVisibility;
		},
	};
	game.hhDialogVisibility = controller;
	sync(true);
	return controller;
}
