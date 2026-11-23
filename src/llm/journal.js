// Diagnostic output is separate from seat strategy memory and game-history injection.
export function createLLMJournal(perspective) {
	let entries = [], sequence = 0, requestSequence = 0;
	const listeners = new Set();
	const notify = () => { for (const listener of listeners) { try { listener(); } catch {} } };
	function begin(player, event, round, model, key = '') {
		const redact = value => key ? String(value ?? '').split(key).join('[已隐藏密钥]') : String(value ?? '');
		const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'string' ? redact(item) : item));
		const entry = { id: ++sequence, request: ++requestSequence, seat: perspective.seat(player),
			generals: perspective.names(player, player).map(perspective.text), round, event: event.name, model: redact(model),
			status: 'pending', reasoning: '', content: '', operations: [] };
		entries.push(entry); notify();
		return {
			output(value) { if (!entries.includes(entry)) return; entry.reasoning = redact(value.reasoning); entry.content = redact(value.content);
				entry.output = copy(value.tool_calls); entry.status = 'received'; notify(); },
			operation(input, outcome, state) {
				if (!entries.includes(entry)) return;
				const labels = {};
				for (const item of [...(state.cards || []), ...(state.targets || []), ...(state.buttons || []), ...(state.skills || []), ...(state.groups || []).flatMap(group => group.items)]) {
					labels[item.id] = item.player || item.text || item.item?.text || (item.hidden ? '暗牌' : item.name) || item.id;
				}
				for (const item of state.controls || []) labels['control:' + item.index] = item.text || item.name;
				entry.operations.push(copy({ input, outcome: { ok: outcome.ok, submitted: outcome.submitted, applied: outcome.applied, error: outcome.error }, labels }));
				if (!outcome.ok) entry.status = 'repair'; else if (outcome.submitted) entry.status = 'submitted';
				notify();
			},
			finish(status = 'complete', error = '') { if (!entries.includes(entry)) return; entry.status = status === 'complete' && entry.operations.some(operation => !operation.outcome.ok) ? 'repair' : status; if (error) entry.error = redact(error); notify(); },
		};
	}
	return { begin,
		reset() { entries = []; sequence = 0; requestSequence = 0; notify(); },
		read(seat, { before = Infinity, after = 0, limit = Infinity } = {}) {
			const found = entries.filter(entry => (seat == null || entry.seat === seat) && entry.id < before && entry.id > after);
			return found.slice(Number.isFinite(limit) ? -Math.max(1, limit) : 0).map(entry => JSON.parse(JSON.stringify(entry)));
		},
		seats() { return [...new Map(entries.map(entry => [entry.seat, { seat: entry.seat, generals: [...entry.generals] }])).values()]; },
		resolve(player, resolution) { const entry = entries.findLast(entry => entry.seat === perspective.seat(player)); if (entry) { entry.resolution = resolution; notify(); } },
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
	};
}
