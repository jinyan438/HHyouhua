// Native ConfirmWindow (Svi): 688 x 362, with secbtn_sub / secbtn_nrm buttons.
export function createLeaveDialog({ game, ui, _status = {} }, { returnFocus, onConfirm } = {}) {
	const doc = ui.window.ownerDocument, win = doc.defaultView || globalThis;
	let root, previousFocus, pausedHere = false, submitting = false, observer;

	function resize() {
		const width = ui.window.clientWidth || win.innerWidth || 1650;
		const height = ui.window.clientHeight || win.innerHeight || 750;
		root?.style.setProperty("--hh-leave-unit", `${Math.min(width / 1650, height / 750)}px`);
	}

	function cleanup(resume = true) {
		if (!root) return;
		root.remove(); root = null;
		doc.removeEventListener("keydown", keydown, true);
		win.removeEventListener?.("resize", resize);
		observer?.disconnect(); observer = null;
		if (resume && pausedHere) game.resume2?.();
		pausedHere = false;
		if (resume) {
			const target = previousFocus?.isConnected ? previousFocus : returnFocus;
			target?.focus({ preventScroll: true });
		}
		previousFocus = null;
	}

	function finish(confirmed) {
		if (!root || submitting) return;
		game.playAudio?.("../extension/HH优化/ui/assets/lbtn/CD/button.mp3");
		if (confirmed) {
			submitting = true;
			const reloading = _status.reloading;
			// The engine's beforeunload handler already honors this flag.
			_status.reloading = true;
			try { onConfirm?.(); win.location.reload(); }
			catch (error) { _status.reloading = reloading; submitting = false; throw error; }
		}
		cleanup(!confirmed);
	}

	function keydown(event) {
		if (event.key === "Escape") {
			event.preventDefault(); event.stopPropagation(); finish(false);
		} else if (event.key === "Tab") {
			const controls = Array.from(root.querySelectorAll("button"));
			const index = controls.indexOf(doc.activeElement);
			const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
			event.preventDefault(); event.stopPropagation(); controls[next]?.focus();
		}
	}

	function open() {
		if (root) return root;
		submitting = false;
		previousFocus = doc.activeElement;
		root = doc.createElement("div"); root.className = "hh-leave-dialog-backdrop";
		const panel = doc.createElement("section"); panel.className = "hh-leave-dialog";
		panel.setAttribute("role", "alertdialog"); panel.setAttribute("aria-modal", "true");
		panel.setAttribute("aria-labelledby", "hh-leave-title"); panel.setAttribute("aria-describedby", "hh-leave-message");
		root.appendChild(panel);
		const title = doc.createElement("h2"); title.className = "hh-leave-title"; title.id = "hh-leave-title"; title.textContent = "离开牌局";
		panel.appendChild(title);
		const message = doc.createElement("div"); message.className = "hh-leave-message"; message.id = "hh-leave-message";
		message.textContent = "是否离开房间\n此时离开无额外惩罚"; panel.appendChild(message);
		function button(name, label, text) {
			const node = doc.createElement("button"); node.type = "button"; node.className = `hh-leave-${name}`;
			node.setAttribute("aria-label", label); node.textContent = text;
			node.addEventListener("click", () => finish(name === "confirm")); panel.appendChild(node); return node;
		}
		button("close", "关闭", "");
		const cancel = button("cancel", "取消", "取 消");
		button("confirm", "确定", "确 定");
		root.addEventListener("click", event => { event.stopPropagation(); if (event.target === root) finish(false); });
		for (const type of ["pointerdown", "mousedown", "touchstart", "touchmove", "wheel"]) root.addEventListener(type, event => event.stopPropagation());
		ui.window.appendChild(root);
		pausedHere = !_status.connectMode && !_status.paused2 && typeof game.pause2 === "function";
		if (pausedHere) game.pause2();
		resize();
		observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
		observer?.observe(ui.window);
		win.addEventListener?.("resize", resize);
		doc.addEventListener("keydown", keydown, true);
		cancel.focus({ preventScroll: true });
		return root;
	}
	return { open, close: () => finish(false), destroy: () => cleanup() };
}
