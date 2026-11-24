// Use numeric inline zoom as well as the native card geometry. Android clients
// may load different dialog styles or retain a character-selection arena class.
export function updateDialogCardSizing(dialog, scale, event) {
	if (!dialog?.content || !Number.isFinite(scale) || scale <= 0) return;
	if (dialog.classList.contains("hh-source-move-dialog") || dialog.classList.contains("hh-source-reveal-dialog") ||
		["chooseToMove", "chooseToMove_new"].includes(event?.name)) return;

	const setZoom = (node, value) => {
		const current = Number.parseFloat(node.style.getPropertyValue("zoom"));
		if (!Number.isFinite(current) || Math.abs(current - value) > 0.000001 || node.style.getPropertyPriority("zoom") !== "important") {
			node.style.setProperty("zoom", String(value), "important");
		}
	};
	for (const card of dialog.content.querySelectorAll(".card.button")) {
		if (card.closest(".dialog") !== dialog) continue;
		const row = card.parentElement;
		if (!row.classList.contains("buttons") && !row.classList.contains("item-container")) continue;
		if (row.classList.contains("buttons")) setZoom(row, 1);
		const compact = row.classList.contains("smallzoom") || dialog.classList.contains("addNewRow");
		setZoom(card, compact ? Math.min(0.7, scale) : scale);
	}
}
