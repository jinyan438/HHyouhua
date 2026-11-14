/**
 * @fileoverview 新杀风格角色弹窗
 * 特点：龙框、资料页面、装备对话框、VIP系统
 */
import { lib, game, ui, get, ai, _status } from "noname";
import { createBaseCharacterPlugin } from "./base.js";

export function createXinshaCharacterPlugin(lib, game, ui, get, ai, _status, app) {
	const base = createBaseCharacterPlugin(lib, game, ui, get, ai, _status, app);

	const IMAGE_PATH = "extension/HH优化/ui/assets/character/xinsha/";
	const AUDIO_PATH = "../extension/HH优化/ui/assets/lbtn/shousha/";

	// 随机昵称
	const NICKNAMES = [
		"缘之空",
		"小小恐龙",
		"自然萌",
		"海边的ebao",
		"小云云",
		"无语",
		"点点",
		"猫猫虫",
		"小爱莉",
		"冰佬",
		"鹿鹿",
		"黎佬",
		"小曦",
		"墨渊",
		"浮牢师",
		"U佬",
		"蓝宝",
		"影宝",
		"柳下跖",
		"k9",
		"扶苏",
		"皇叔",
	];

	return {
		...base,
		skinName: "xinsha",

		// 获取对话框背景
		getGroupBackgroundImage(group) {
			return `${IMAGE_PATH}yemian.png`;
		},

		// 获取龙框背景
		getLongkuangBackgroundImage(group) {
			if (!this.validGroups.includes(group)) group = "default";
			return `${IMAGE_PATH}${group}.png`;
		},

		click: {
			...base.click,

			playerIntro(e, node) {
				e?.preventDefault();
				e?.stopPropagation();
				const plugin = this;
				const player = node || this;

				// 每次都重新创建对话框，确保显示正确的玩家信息
				if (plugin.playerDialog) {
					plugin.playerDialog.remove();
					plugin.playerDialog = null;
				}

				const container = ui.create.div(".popup-container.hidden", ui.window, ev => {
					if (ev.target === container) {
						container.hide();
						game.resume2();
					}
				});

				const playname = player === game.me ? lib.config.connect_nickname : get.translation(NICKNAMES.randomGet(1));

				// 创建对话框结构
				const dialog = ui.create.div(".xinsha-character-dialog.popped", container);
				const leftPane = ui.create.div(".left", dialog);
				const rightPane = ui.create.div(".right", dialog);
				const xing = ui.create.div(".xing", dialog);
				const biankuangname = ui.create.div(".biankuangname", dialog);
				const mingcheng = ui.create.div(".mingcheng", dialog);
				const dengji = ui.create.div(".dengji", dialog);

				// 技能按钮
				const skill = ui.create.div(".skillx", dialog);
				skill.addEventListener("click", () => {
					game.playAudio(`${AUDIO_PATH}caidan.mp3`);
					clearRightPane();
					container.show(player, true);
					equip?.classList.remove("active");
					skill?.classList.add("active");
				});

				// 装备按钮
				const equip = ui.create.div(".equip", dialog);
				equip.addEventListener("click", () => {
					game.playAudio(`${AUDIO_PATH}caidan.mp3`);
					clearRightPane();
					skill?.classList.remove("active");
					equip?.classList.add("active");
					container.show(player);
				});

				function clearRightPane() {
					if (rightPane.firstChild) {
						while (rightPane.firstChild.firstChild) {
							rightPane.firstChild.removeChild(rightPane.firstChild.firstChild);
						}
					}
				}

				// 创建资料页面
				const createProfilePage = () => {
					const zbdialog = ui.create.div(".zbdialog", dialog);
					const caizhu = ui.create.div(".caizhu", dialog);
					const leftPaneProfile = ui.create.div(lib.config.extension_HH优化_ZLLT ? ".left" : ".left2", dialog);
					leftPaneProfile.style.backgroundImage = player.node.avatar.style.backgroundImage;

					// 装备对话框
					zbdialog.onclick = () => {
						const popuperContainer = ui.create.div(".popup-container", { background: "rgb(0,0,0,0)" }, ui.window);
						game.playAudio(`${AUDIO_PATH}label.mp3`);
						ui.create.div(".zbbigdialog", popuperContainer);
						const guanbi = ui.create.div(".guanbi", popuperContainer, "   ");
						guanbi.addEventListener("click", ev => {
							game.playAudio(`${AUDIO_PATH}caidan.mp3`);
							popuperContainer.delete(200);
							ev.stopPropagation();
						});
					};

					// 资料对话框
					caizhu.onclick = () => {
						const popuperContainer = ui.create.div(".popup-container", { background: "rgb(0,0,0,0)" }, ui.window);
						game.playAudio(`${AUDIO_PATH}label.mp3`);
						const bigdialog = ui.create.div(".bigdialog", popuperContainer);

						ui.create.div(".useless", bigdialog);
						const nameshutiao = ui.create.div(".nameshutiao", bigdialog);
						const rarity = game.getRarity(player.name) || "junk";
						nameshutiao.setBackgroundImage(`${IMAGE_PATH}${rarity}.png`);

						const useless2 = ui.create.div(".useless2", bigdialog);
						useless2.setBackgroundImage(`${IMAGE_PATH}InfoBg2.png`);

						// 样式框
						const pifuk = ui.create.div(".pifuk", bigdialog);
						pifuk.setBackgroundImage(`${IMAGE_PATH}pifuk.png`);

						// 样式名
						const skinname = plugin.utils.getQhlySkinTranslation(player.name);
						ui.create.div(".pifuming", bigdialog, skinname);

						// 武将名
						const wujiangming = ui.create.div(".wujiangming", bigdialog);
						wujiangming.innerHTML = get.slimNameHorizontal(player.name);

						// 玩家名
						const wanjiaming = ui.create.div(".wanjiaming", bigdialog, playname);

						// VIP图标
						const vipimg = document.createElement("div");
						vipimg.style.cssText = "width:60px;top:2px;height:20px;left:3px;position:relative;background-size:100% 100%;";
						const vipPath =
							player._vipCache || (player._vipCache = ["vip0", "vip1", "vip2", "vip3", "vip4", "vip5", "vip6", "vip7"].randomGet());
						vipimg.setBackgroundImage(`${IMAGE_PATH}${vipPath}.png`);
						wanjiaming.appendChild(vipimg);

						// 公会信息
						const guildInfo =
							player._guildInfo ||
							(player._guildInfo = {
								name: [
									"武将美化群",
									"活动武将群",
									"😋精致小杀",
									"萌新花园",
									"😋精致小酒",
									"小爱莉の动物园",
									"Ciallo～(∠・ω< )⌒★",
									"美图交流群",
									"无名杀主题样式",
									"💎备用💎",
									"无名杀琉璃版",
									"圣杯战争",
								].randomGet(1),
								icon: ["c1", "c2", "c3"].randomGet(),
							});
						const gonghui = ui.create.div(".gonghui", bigdialog, `公会：${guildInfo.name}`);
						const gonghuiimg = document.createElement("div");
						gonghuiimg.style.cssText = "width:40px;top:2px;height:15px;left:20px;position:relative;background-size:100% 100%;";
						gonghuiimg.setBackgroundImage(`${IMAGE_PATH}${guildInfo.icon}.png`);
						gonghui.appendChild(gonghuiimg);

						// 玩家数据
						if (!player.profileData) {
							player.profileData = {
								xinyu: Math.floor(Math.random() * 900) + 99,
								meili: Math.floor(Math.random() * 900) + 99,
								shouhu: Math.floor(Math.random() * 1) + 999,
								wujiang1: Math.floor(Math.random() * 999) + 1000,
								pifu1: Math.floor(Math.random() * 999) + 3000,
								jiangling: Math.floor(Math.random() * 89) + 10,
							};
						}

						ui.create.div(".xinyu", bigdialog, `${player.profileData.xinyu}<br>信誉`);
						ui.create.div(".meili", bigdialog, `${player.profileData.meili}<br>魅力`);
						ui.create.div(".shouhu", bigdialog, `${player.profileData.shouhu}<br>守护`);
						ui.create.div(".wujiang1", bigdialog, `${player.profileData.wujiang1}<br>武将`);
						ui.create.div(".pifu1", bigdialog, `${player.profileData.pifu1}<br>样式`);
						ui.create.div(".jiangling", bigdialog, `${player.profileData.jiangling}<br>将灵`);
						ui.create.div(".changyongwujiang", bigdialog, "武将展示");

						// 称号
						const minichenghao = ui.create.div(".minichenghao", bigdialog);
						const chenghaoData = player.chenghaoData || (player.chenghaoData = { img: `ch${Math.floor(Math.random() * 27)}` });
						minichenghao.setBackgroundImage(`${IMAGE_PATH}${chenghaoData.img}.png`);

						// 拜师
						const baishi = ui.create.div(".baishi", bigdialog);
						const baishiData = player.baishiData || (player.baishiData = { img: ["b1", "b2", "b3"].randomGet() });
						baishi.setBackgroundImage(`${IMAGE_PATH}${baishiData.img}.png`);

						// 历史最高
						const wngs = ui.create.div(".wngs", bigdialog);
						const historyData = player.historyData || (player.historyData = { img: ["s1", "s2", "s3", "s4", "s5", "s6"].randomGet() });
						wngs.setBackgroundImage(`${IMAGE_PATH}${historyData.img}.png`);

						// 将灯
						const deng = ui.create.div(".deng", bigdialog);
						const lampData = player.lampData || (player.lampData = { img: ["d1", "d2", "d3", "d4", "d5", "d6", "d7"].randomGet() });
						deng.setBackgroundImage(`${IMAGE_PATH}${lampData.img}.png`);

						// 关闭按钮
						const haoyou3 = ui.create.div(".haoyou3", bigdialog, "   ");
						haoyou3.addEventListener("click", ev => {
							game.playAudio(`${AUDIO_PATH}caidan.mp3`);
							popuperContainer.delete(200);
							ev.stopPropagation();
						});

						const shanchang4 = ui.create.div(".shanchang4", bigdialog);
						shanchang4.style.backgroundImage = player.node.avatar.style.backgroundImage;

						// 迷你头像
						const minixingxiang = ui.create.div(".minixingxiang", bigdialog);
						const miniData =
							player.miniXingxiangData || (player.miniXingxiangData = { img: `xingxiang${Math.floor(Math.random() * 6)}` });
						minixingxiang.setBackgroundImage(`${IMAGE_PATH}${miniData.img}.png`);
					};
				};

				// 设置背景
				const group = player.group;
				dialog.style.backgroundImage = `url("${plugin.getGroupBackgroundImage(group)}")`;

				// 立绘
				const skin1 = ui.create.div(".skin1", dialog);
				const skin2 = ui.create.div(".skin2", dialog);

				let name = player.name1 || player.name;
				let name2 = player.name2;
				if (player.classList.contains("unseen") && player !== game.me) name = "unknown";
				if (player.classList.contains("unseen2") && player !== game.me) name2 = "unknown";

				// 主将立绘
				if (name !== "unknown") {
					const playerSkin = player.style.backgroundImage || player.childNodes[0]?.style.backgroundImage;
					plugin.utils.setLihuiDiv(skin1, playerSkin);
				} else {
					skin1.style.backgroundImage = `url("${lib.assetURL}extension/HH优化/ui/assets/character/xinsha/unknown.png")`;
				}

				// 副将立绘
				if (name2) {
					if (name2 !== "unknown") {
						const playerSkin2 = player.childNodes[1]?.style.backgroundImage;
						plugin.utils.setLihuiDiv(skin2, playerSkin2);
					} else {
						skin2.style.backgroundImage = `url("${lib.assetURL}extension/HH优化/ui/assets/character/xinsha/unknown.png")`;
					}
				}

				// 等阶
				let rarity = game.getRarity(name) || "junk";
				const pe = ui.create.div(".pe1", dialog);
				const peUrl = lib.config["extension_千幻聆音_enable"]
					? `${IMAGE_PATH}pe_${plugin.utils.getQhlyLevel(name)}.png`
					: `${IMAGE_PATH}pe_${rarity}.png`;
				pe.style.backgroundImage = `url("${peUrl}")`;

				// 关闭按钮
				const diaozhui = ui.create.div(".diaozhui", dialog);
				diaozhui.setBackgroundImage(`${IMAGE_PATH}guanbi.png`);
				diaozhui.addEventListener("click", () => {
					game.playAudio(`${AUDIO_PATH}caidan.mp3`);
					container.hide();
					game.resume2();
				});

				// 龙框
				const longkuang = ui.create.div(".longkuang", dialog);
				longkuang.setBackgroundImage(plugin.getLongkuangBackgroundImage(group));

				// 等级标识
				const level = ui.create.div(".level", dialog);
				const levelData = player.levelData || (player.levelData = { img: String(Math.floor(Math.random() * 13) + 1) });
				level.setBackgroundImage(`${IMAGE_PATH}${levelData.img}.png`);

				// 技能框
				const wjkuang = ui.create.div(".wjkuang", dialog);

				// 武将技能展示
				ui.create.div(".jineng", dialog, "武将技能");

				// 武将姓名
				const wjname = ui.create.div(".wjname", dialog);
				wjname.innerHTML = get.slimNameHorizontal(player.name);

				// 玩家名
				ui.create.div(".wanjiaming2", dialog, playname);

				leftPane.innerHTML = "<div></div>";
				rightPane.innerHTML = "<div></div>";
				lib.setScroll(rightPane.firstChild);

				// 显示函数
				container.show = (player, bool, under) => {
					if (under) createProfilePage();

					let oSkills = player.getSkills(null, false, false).slice(0);
					oSkills = oSkills.filter(
						s => lib.skill[s] && s !== "jiu" && !lib.skill[s].nopop && !lib.skill[s].equipSkill && lib.translate[s + "_info"]
					);
					if (player === game.me && player.hiddenSkills?.length) oSkills.addArray(player.hiddenSkills);

					const allShown = player.isUnderControl() || (!game.observe && game.me?.hasSkillTag("viewHandcard", null, player, true));
					const shownHs = player.getShownCards();

					if (bool) {
						skill?.classList.add("active");
						// 显示武将技能
						if (oSkills.length) {
							oSkills.forEach(name => plugin.createSkillItem(rightPane.firstChild, name, player, container));
						}
					} else {
						// 显示装备区域
						const eSkills = player.getVCards("e");
						if (eSkills.length) {
							eSkills.forEach(card => {
								const cards = card.cards;
								let isQiexie = card.name.startsWith("qiexie_");
								let displayName = card.name + "_info";
								// 只显示卡牌名称，不重复显示花色点数
								let str = [get.translation(isQiexie ? card.name : card), get.translation(displayName)];
								// 只有当cards与card本身不同时才添加原卡信息
								if (Array.isArray(cards) && cards.length && (cards.length !== 1 || cards[0].name !== card.name)) {
									str[0] += `（${get.translation(cards)}）`;
								}
								if (lib.card[card.name]?.cardPrompt) {
									str[1] = lib.card[card.name].cardPrompt(card, player);
								}
								if (isQiexie && lib.translate[card.name + "_append"]) {
									str[1] += `<br><br><div style="font-size: 0.85em; font-family: xinwei; line-height: 1.2;">${lib.translate[card.name + "_append"]}</div>`;
								}
								ui.create.div(
									".xskillx",
									`<div data-color>${str[0]}</div><div>${str[1]}</div>`,
									rightPane.firstChild
								).style.marginBottom = "10px";
							});
						}

						// 显示视为装备（extraEquip）
						if (player.extraEquip?.length) {
							const shownEquips = new Set();
							player.extraEquip.forEach(info => {
								const [skillName, equipName, preserve] = info;
								// 检查是否满足视为装备的条件
								if (preserve && !preserve(player)) return;
								// 避免重复显示同一装备
								if (shownEquips.has(equipName)) return;
								shownEquips.add(equipName);

								const skillTrans = lib.translate[skillName] || skillName;
								const equipTrans = lib.translate[equipName] || equipName;
								const equipInfo = lib.translate[equipName + "_info"] || "";
								ui.create.div(
									".xskillx",
									`<div data-color>【${skillTrans}】视为装备【${equipTrans}】</div><div>${equipInfo}</div>`,
									rightPane.firstChild
								).style.marginBottom = "10px";
							});
						}

						// 显示手牌区域
						plugin.showHandCards(rightPane.firstChild, player);

						// 显示判定区域
						const judges = player.getVCards("j");
						if (judges.length) {
							ui.create.div(".xcaption", "判定区域", rightPane.firstChild);
							judges.forEach(card => {
								const cardx = game.createCard(
									get.name(card, false),
									get.suit(card, false),
									get.number(card, false),
									get.nature(card, false)
								);
								cardx.style.zoom = "0.8";
								rightPane.firstChild.appendChild(cardx);
							});
						}

						if (!shownHs.length && !allShown && !judges.length && !eSkills.length) {
							ui.create.div(".noxcaption", rightPane.firstChild);
						}
					}

					container.classList.remove("hidden");
					game.pause2();
				};

				plugin.playerDialog = container;
				container.show(player, true, true);
			},
		},
	};
}
