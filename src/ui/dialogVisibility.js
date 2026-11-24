const dialogSelector = ".dialog, .skill-dialog, .dui-dialog, .confirm-box, .popup-container, .baby_skill_popup, [role='dialog']";
const legacyLabels = new Set(["隐藏窗口", "显示窗口", "隐藏弹窗", "显示弹窗"]);

export function setupDialogVisibility({ game, ui, _status }, doc = document) {
	if (game.hhDialogVisibility) return game.hhDialogVisibility;
	const states = new Map(), closed = new WeakSet(), legacyControls = new Set();
	const view = doc.defaultView;
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
			if (part === state.button) continue;
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
		state.button.textContent = "隐藏";
		state.button.setAttribute("aria-label", "隐藏弹窗");
		state.button.setAttribute("aria-expanded", "true");
	};
	const release = dialog => {
		const state = states.get(dialog);
		if (!state) return;
		restoreParts(state);
		state.button.remove();
		dialog.classList.remove("hh-dialog-toggle-host", "hh-dialog-collapsed", "hh-dialog-has-close");
		states.delete(dialog);
	};
	const attach = (dialog, reset = false) => {
		const host = hostFor(dialog);
		if (!host || host === ui.arena || host === ui.window || host === doc.body) return;
		if (reset) closed.delete(host);
		if (closed.has(host)) return;
		let state = states.get(host);
		if (!state) {
			// A containing popup owns the toggle for its nested dialogs as well.
			for (const existing of states.keys()) if (host.contains(existing)) release(existing);
			for (const child of Array.from(host.children)) if (child.classList.contains("hh-dialog-toggle")) child.remove();
			const button = doc.createElement("button");
			button.type = "button";
			button.className = "hh-dialog-toggle";
			state = { dialog: host, button, collapsed: false, parts: new Map() };
			const stop = event => event.stopPropagation();
			for (const type of ["pointerdown", "mousedown", "touchstart", "touchend", "dblclick"]) button.addEventListener(type, stop);
			button.addEventListener("click", event => {
				event.stopPropagation();
				event.preventDefault();
				if (state.collapsed) expand(state);
				else {
					state.collapsed = true;
					host.classList.add("hh-dialog-collapsed");
					concealParts(state);
					button.textContent = "显示";
					button.setAttribute("aria-label", "显示弹窗");
					button.setAttribute("aria-expanded", "false");
				}
			});
			host.classList.add("hh-dialog-toggle-host");
			host.appendChild(button);
			states.set(host, state);
			expand(state);
		} else if (reset) expand(state);
		if (state.collapsed) concealParts(state);
		if (state.button.parentElement !== host) host.appendChild(state.button);
		host.classList.toggle("hh-dialog-has-close", !!host.querySelector(".close, .close-button, .close-btn, [aria-label='关闭']"));
		return state.button;
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
		// Leave event-owned controls in place for native cleanup, while showing
		// just one visibility toggle instead of two different buttons.
		for (const control of legacyControls) if (!control.isConnected) legacyControls.delete(control);
		for (const control of ui.control?.querySelectorAll(".control") || []) {
			if (legacyLabels.has(control.textContent.trim())) legacyControls.add(control);
		}
		for (const control of legacyControls) control.classList.toggle("hh-dialog-legacy-toggle", states.size > 0);
	};
	const observer = view?.MutationObserver ? new view.MutationObserver(records => {
		const active = _status.event?.dialog;
		if ((active?.isConnected && !states.has(hostFor(active))) || records.some(record =>
			(states.get(record.target)?.collapsed && record.addedNodes.length > 0) ||
			Array.from(record.addedNodes).some(node => node.nodeType === 1 &&
				(node.matches(dialogSelector + ", .control") || node.querySelector(dialogSelector + ", .control"))) ||
			Array.from(record.removedNodes).some(node => node.nodeType === 1 &&
				Array.from(states.values()).some(state => node === state.dialog || node.contains(state.dialog) || node === state.button || node.contains(state.button))))) sync(true);
	}) : null;
	observer?.observe(doc.body, { childList: true, subtree: true });
	ui.updates.push(sync);
	const controller = {
		attach,
		close(dialog) { if (states.has(dialog)) { closed.add(dialog); release(dialog); } },
		sync: () => sync(true),
		dispose() {
			observer?.disconnect();
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
