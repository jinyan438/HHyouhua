import { addCharacterCatalogMenu } from "../../src/ui/characterBrowserMenu.js";

// Original toolbar: $rs.moveBtns in sanguosha2/work/main.js.
// Each item moves 300 design pixels in 150 ms, staggered by 45 ms.
export function createSanguoshaMenu(context, { openBackground, addSystemItems } = {}) {
	const { lib, game, ui } = context;
	const doc = ui.window.ownerDocument;
	const win = doc.defaultView || globalThis;
	const assets = `${lib.assetURL || ""}extension/HH优化/ui/assets/lbtn/sanguosha/`;
	const audio = "../extension/HH优化/ui/assets/lbtn/CD/";
	const button = doc.createElement("button");
	button.type = "button";
	button.className = "caidanbutton hh-sanguosha-menu-toggle";
	button.setAttribute("aria-label", "菜单");
	button.setAttribute("aria-expanded", "false");
	button.setAttribute("aria-controls", "hh-sanguosha-menu-panel");
	ui.window.appendChild(button);
	let popup, retiring, items = [], motions = [], scale = 1;

	function resize() {
		const width = ui.window.clientWidth || win.innerWidth || 1650;
		const height = ui.window.clientHeight || win.innerHeight || 750;
		// Follow the native 1650 x 750 canvas, including the game's document zoom.
		// A CSS-pixel minimum enlarges this toolbar on high-density phone screens.
		scale = Math.min(width / 1650, height / 750);
		for (const node of [button, popup, retiring]) node?.style.setProperty("--hh-menu-unit", `${scale}px`);
	}
	resize();
	const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
	observer?.observe(ui.window);
	win.addEventListener?.("resize", resize);

	function close(sound = true, restoreFocus = true) {
		if (!popup) return;
		const layer = popup;
		popup = null;
		retiring = layer;
		layer.inert = true;
		layer.style.pointerEvents = "none";
		button.setAttribute("aria-expanded", "false");
		doc.removeEventListener("keydown", keydown);
		if (sound) game.playAudio(`${audio}back.mp3`);
		if (restoreFocus) button.focus({ preventScroll: true });
		const starts = items.map(item => win.getComputedStyle?.(item).transform || "none");
		motions.forEach(motion => motion.cancel());
		const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		motions = reduced ? [] : items.map((item, index) => item.animate?.([
			{ transform: starts[index] }, { transform: `translateX(${300 * scale}px)` },
		], { duration: 150, delay: (items.length - index - 1) * 45, easing: "cubic-bezier(.39,.575,.565,1)", fill: "both" })).filter(Boolean);
		Promise.all(motions.map(motion => motion.finished.catch(() => {}))).then(() => {
			layer.remove();
			if (retiring === layer) retiring = null;
		});
	}

	function keydown(event) {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
			event.preventDefault();
			const index = items.indexOf(doc.activeElement);
			const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0) : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
			items[next]?.focus();
		}
	}

	function open() {
		if (popup) return;
		motions.forEach(motion => motion.cancel());
		retiring?.remove();
		retiring = null;
		game.playAudio(`${audio}click.mp3`);
		const layer = doc.createElement("div");
		layer.className = "hh-sanguosha-menu";
		const shade = doc.createElement("div");
		shade.className = "hh-sanguosha-menu-shade";
		shade.setAttribute("aria-hidden", "true");
		layer.appendChild(shade);
		const panel = doc.createElement("nav");
		panel.className = "hh-sanguosha-menu-panel";
		panel.id = "hh-sanguosha-menu-panel";
		panel.setAttribute("aria-label", "游戏菜单");
		layer.appendChild(panel);
		layer.addEventListener("click", event => {
			if (event.target === layer || event.target === shade) { event.stopPropagation(); close(); }
		});
		popup = layer;
		ui.window.appendChild(layer);
		resize();

		function item(id, label, image, action) {
			const node = doc.createElement("button");
			node.type = "button";
			node.className = "hh-sanguosha-menu-item";
			node.dataset.action = id;
			node.setAttribute("aria-label", label);
			const picture = doc.createElement("img");
			picture.src = assets + image;
			picture.alt = "";
			picture.draggable = false;
			node.appendChild(picture);
			node.addEventListener("click", event => {
				event.stopPropagation();
				if (popup !== layer) return;
				close(false, false);
				game.playAudio(`${audio}button.mp3`);
				action();
			});
			panel.appendChild(node);
		}
		item("settings", "设置", "btn_setting2_0.png", () => {
			game.closePopped?.();
			game.pause2?.();
			ui.click.configMenu?.();
			ui.system1?.classList.remove("shown");
			ui.system2?.classList.remove("shown");
		});
		item("background", "背景", "btn_background2_0.png", openBackground);
		item("auto", "托管", "tool_trusteeship_0.png", () => ui.click.auto());
		const character = addCharacterCatalogMenu(context, panel, { layout: "row", close: () => close(false, false) });
		character.classList.add("hh-sanguosha-menu-item");
		character.dataset.action = "characters";
		character.addEventListener("click", () => game.playAudio(`${audio}button.mp3`));
		item("leave", "离开", "btn_back2_0.png", () => win.location.reload());
		// Preserve menu entries supplied by other extensions.
		addSystemItems?.(panel);
		items = Array.from(panel.children);
		for (const node of items) {
			if (!node.classList.contains("hh-sanguosha-menu-item")) {
				node.classList.add("hh-sanguosha-menu-item", "hh-sanguosha-menu-extra");
				node.addEventListener("click", () => close(false, false));
			}
		}
		button.setAttribute("aria-expanded", "true");
		doc.addEventListener("keydown", keydown);
		const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		motions = reduced ? [] : items.map((node, index) => node.animate?.([
			{ transform: `translateX(${300 * scale}px)` }, { transform: "translateX(0)" },
		], { duration: 150, delay: index * 45, easing: "cubic-bezier(.39,.575,.565,1)", fill: "both" })).filter(Boolean);
	}
	button.onclick = () => popup ? close() : open();
	return {
		button, open, close,
		destroy() {
			doc.removeEventListener("keydown", keydown);
			win.removeEventListener?.("resize", resize);
			observer?.disconnect();
			motions.forEach(motion => motion.cancel());
			popup?.remove(); retiring?.remove(); button.remove();
			popup = retiring = null;
		},
	};
}
