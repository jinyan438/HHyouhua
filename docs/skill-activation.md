# 觉醒与限定技发动动画

素材取自 `E:\AI\sanguosha\sanguosha2\yoka.game_g_android_4.0.2.apk` 的 Laya 缓存，原路径为 `res/assets/animate/game/skinskillXdJx/`。四档骨骼、图集与 PNG 保存在 `assets/skill-activation/`，文件来源及 SHA-256 见该目录的 `sources.json`。

`sanguosha2/work/main.js` 中的 `skinHasXDJXSkill`、`loadSkinHasSkillComplete`、`setSkinSkillSlot` 给出了原版逻辑，原文摘录保存为 `assets/skill-activation/source-logic.txt`：按皮肤品质选择稀有、史诗、传说、限定骨骼；觉醒播放 `play`，限定技播放 `play2`；武将图替换 `1_4xianding`，技能文字替换 `1_5juexingzi` 或 `1_7xiandingzi`。原动作时长约 2.1～2.23 秒。

HH 适配位于 `src/effects/sourceSkillActivation.js`。品质使用当前武将稀有度；头像兼容主副将与现有立绘取图逻辑；技能名使用原版字体，放在横幅两侧。每次发动使用独立皮肤和文字纹理，避免多个技能相互覆盖。关闭动画或资源加载失败时保留文字提示；切后台或对局结束后清理动画与待加载请求。

入口为 `playerTrySkillAnimate → playerSkill → playSkillEffect`。按技能 ID 的 `juexingji`、`limited` 区分动作，未声明 `skillAnimation` 的觉醒和限定技也可显示；录像数据保留技能 ID 与主副将参数。普通技能继续使用原有入口。

音频核对：这四个骨骼的两个动作均没有音频事件，原版上述发动逻辑也没有播放独立的通用音效。原游戏另由 `GetGeneralSkillSound` / `getSkillSoundUrl` 播放各武将技能台词，HH 已有武将台词继续按技能播放。

验证：`node --test tests/source-skill-activation.test.mjs tests/source-skill-popup.test.mjs`。另在真实浏览器中检查四档品质、觉醒/限定两种动作与桌面/手机横屏共 16 种画面，以及实际引擎模块的发动、回放参数和关闭动画回退。
