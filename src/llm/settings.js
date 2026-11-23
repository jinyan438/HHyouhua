import { LLM_PREFIX, readConnection, fetchModels, apiRoot } from './client.js';
import { bindDialogButton, isolateDialogInput } from './dialog.js';

export function createLLMConfig({ lib, game, ui }) {
	function openSettings() {
		if (document.getElementById('HH-llm-settings')) return;
		const dialog = document.createElement('dialog');
		dialog.id = 'HH-llm-settings';
		dialog.style.cssText = 'width:min(640px,88vw);max-height:84vh;overflow:auto;z-index:100000;padding:24px;border:1px solid #9c8054;border-radius:14px;color:#eee;background:#211d1a;box-sizing:border-box;font:16px system-ui;text-align:left;text-shadow:none;';
		const style = document.createElement('style');
		style.textContent = '#HH-llm-settings::backdrop{background:#0009}#HH-llm-settings *{box-sizing:border-box}#HH-llm-settings [hidden]{display:none!important}#HH-llm-settings div{position:static;display:block;transition:none}#HH-llm-settings label{display:block;margin:14px 0 5px;text-align:left}#HH-llm-settings input,#HH-llm-settings select,#HH-llm-settings textarea{width:100%;padding:9px;color:#eee;background:#302923;border:1px solid #71604b;border-radius:5px;font:inherit;user-select:text}#HH-llm-settings textarea{min-height:80px;resize:vertical}#HH-llm-settings button{padding:8px 14px;cursor:pointer;color:#eee;background:#514233;border:1px solid #927446;border-radius:5px;font:inherit;touch-action:manipulation}#HH-llm-settings .hh-row{display:flex;gap:10px;align-items:end}#HH-llm-settings .hh-row>div{flex:1;min-width:0}#HH-llm-settings p{font-size:14px;text-align:left;color:#e1c894}';
		dialog.append(style);
		const title = document.createElement('div'); title.textContent = '大模型接管'; title.style.cssText = 'font-size:22px;text-align:left;'; dialog.append(title);
		const usage = game.hhLLM?.usage;
		if (usage) {
			const meter = document.createElement('p'); meter.id = 'HH-llm-usage';
			meter.textContent = `本局 ${usage.requests} 次请求 · 输入 ${usage.input} · 输出 ${usage.output} · 缓存命中 ${usage.cached} tokens` + (usage.reported < usage.requests ? '（部分请求未返回用量）' : '');
			dialog.append(meter);
		}
		const fields = {};
		const saved = name => lib.config[LLM_PREFIX + name];
		function field(label, name, tag = 'input', type = 'text', parent = dialog) {
			const wrapper = document.createElement('div');
			const caption = document.createElement('label'); caption.textContent = label; caption.htmlFor = 'HH-llm-' + name;
			const input = document.createElement(tag); input.id = caption.htmlFor;
			if (tag === 'input') input.type = type;
			input.value = saved(name) ?? '';
			wrapper.append(caption, input); parent.append(wrapper); fields[name] = input;
			return input;
		}
		field('API 地址', 'address').placeholder = 'https://api.example.com/v1';
		const key = field('API 密钥', 'key', 'input', 'password'); key.autocomplete = 'off';
		const modelsRow = document.createElement('div'); modelsRow.className = 'hh-row'; dialog.append(modelsRow);
		const model = field('模型', 'model', 'input', 'text', modelsRow);
		const modelChoice = document.createElement('select'); modelChoice.id = 'HH-llm-model-choice'; model.parentElement.append(modelChoice);
		function showModelInput() {
			model.hidden = !modelChoice.hidden && modelChoice.value !== '';
			model.parentElement.firstChild.htmlFor = model.hidden ? modelChoice.id : model.id;
		}
		function populate(models) {
			const manual = document.createElement('option'); manual.value = ''; manual.textContent = '手动填写';
			modelChoice.replaceChildren(...models.map(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; return option; }), manual);
			modelChoice.hidden = models.length === 0; modelChoice.value = models.includes(model.value) ? model.value : ''; showModelInput();
		}
		modelChoice.onchange = () => { if (modelChoice.value) model.value = modelChoice.value; showModelInput(); if (!model.hidden) model.focus(); };
		populate(saved('models') || []);
		const pull = document.createElement('button'); pull.textContent = '拉取模型'; modelsRow.append(pull);
		const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = game.hhLLM?.lastError || ''; dialog.append(status);
		const row = document.createElement('div'); row.className = 'hh-row'; dialog.append(row);
		const timeout = field('请求超时（秒）', 'timeout', 'input', 'number', row); timeout.value = saved('timeout') || 120; timeout.min = '5'; timeout.max = '600';
		const memory = field('保留最近策略', 'memory', 'input', 'number', row); memory.value = saved('memory') ?? 12; memory.min = '0'; memory.max = '100';
		const failure = field('请求失败时', 'failure', 'select');
		for (const [value, label] of [['ai', '本次使用原生AI'], ['ask', '暂停并询问']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; failure.append(option); }
		failure.value = saved('failure') || 'ai';
		field('通用提示词', 'prompt', 'textarea');
		const seat = field('座位', 'seat', 'select');
		const count = Math.max(8, game.players?.length || 0);
		for (let index = 1; index <= Math.max(16, count); index++) { const option = document.createElement('option'); option.value = index; option.textContent = index + '号位'; seat.append(option); }
		const prompts = { ...(saved('seat_prompts') || {}) };
		const prompt = field('该座位提示词', 'seat_prompt', 'textarea');
		seat.value = '1'; prompt.value = prompts[1] || '';
		let previousSeat = '1';
		seat.onchange = () => { prompts[previousSeat] = prompt.value; previousSeat = seat.value; prompt.value = prompts[previousSeat] || ''; };
		let modelController;
		bindDialogButton(pull, async () => {
			pull.disabled = true; pull.textContent = '正在拉取…'; status.textContent = '正在拉取…'; modelController = new AbortController();
			try {
				const models = await fetchModels({ address: fields.address.value, key: key.value.trim(), timeout: Number(timeout.value) * 1000 || 120000 }, { signal: modelController.signal });
				if (!dialog.isConnected) return;
				if (!model.value || !models.includes(model.value)) model.value = models[0];
				populate(models); fields.models = models;
				status.textContent = '已拉取 ' + models.length + ' 个模型';
			} catch (error) { status.textContent = error.message; }
			finally { pull.disabled = false; pull.textContent = '拉取模型'; }
		});
		const actions = document.createElement('div'); actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;'; dialog.append(actions);
		const close = document.createElement('button'); close.textContent = '取消'; bindDialogButton(close, () => dialog.close());
		const save = document.createElement('button'); save.textContent = '保存';
		bindDialogButton(save, async () => {
			try {
				const address = apiRoot(fields.address.value);
				if (!model.value.trim()) throw new Error('请选择或填写模型');
				prompts[previousSeat] = prompt.value;
				const values = { address, key: key.value.trim(), model: model.value.trim(), timeout: Math.max(5, Math.min(600, Number(timeout.value) || 120)),
					memory: Math.max(0, Math.min(100, Number(memory.value) || 0)), failure: failure.value, prompt: fields.prompt.value,
					seat_prompts: prompts, models: fields.models || saved('models') || [] };
				save.disabled = true;
				for (const [name, value] of Object.entries(values)) { lib.config[LLM_PREFIX + name] = value; await game.saveConfig(LLM_PREFIX + name, value); }
				game.hhLLM?.cancelPending(); dialog.close();
			} catch (error) { status.textContent = error.message; save.disabled = false; }
		});
		actions.append(close, save);
		dialog.onclose = () => { modelController?.abort(); dialog.remove(); };
		isolateDialogInput(dialog);
		document.body.append(dialog); dialog.showModal();
	}
	return {
		llm_title: { name: '<span style="color:#ffcc00">━━━ 大模型接管 ━━━</span>', clear: true },
		llm_enabled: { name: '接管其他座位', init: false,
			intro: '离线对局中，除玩家外的座位由大模型操作。各座位独立上下文，仅发送该座位可见信息。',
			onclick(value) {
				const connection = readConnection(lib);
				if (value && (!connection.address || !connection.model)) { openSettings(); return false; }
				lib.config[LLM_PREFIX + 'enabled'] = value; game.saveConfig(LLM_PREFIX + 'enabled', value); game.hhLLM?.cancelPending();
			},
		},
		llm_settings: { name: '连接与座位设置', clear: true, onclick: openSettings },
	};
}
