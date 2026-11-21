# 伤害动画

资源取自 `E:\AI\sanguosha\sanguosha2\yoka.game_g_android_4.0.2.apk` 的本地缓存，原始路径、缓存键和 SHA-256 记录在 `assets/damage-effects/sources.json`。数字贴图由原版 `res/assets/game/seat.atlas` 的 `baoji_0.png` 至 `baoji_9.png` 无缩放裁切，原始坐标一并保留。

受伤动画使用原版 `AMt.playHurtShaEffect` 和 `FM` 配置的映射：

| 伤害 | 资源 |
| --- | --- |
| 普通 1 点 | `EF_Basic_Sha_03_WD` |
| 普通 2–3 点 | `EF_Basic_Sha_03_2_WD` |
| 普通 4 点及以上 | `EF_Basic_Sha_03_3_WD` |
| 火 | `EF_Basic_Sha_03_huo` |
| 雷 | `EF_Basic_Sha_03_lei` |
| 冰 | `EF_Basic_Sha_03_bing` |

多点伤害数字复用 `AMt.playBaojiHurtEffect` 和 `BaojiHurtStart`：2–3 点播放 `baojishuzhi/play`，4–9 点播放 `play2`，10–99 点播放 `play3`，100–999 点播放 `play4`，并分别替换主数字及残影插槽。更大数值和资源加载失败时显示完整数字文本。

保留 Spine 4.0.56 原始时间轴及速度。使用原版默认命中延迟 180ms，雷伤 2–3 点为 160ms；命中时播放数字及 80ms 向左、80ms 返回的受伤位移。以原版 174×232 武将牌为基准，随实际牌面大小缩放。

`src/effects/sourceDamageEffects.js` 负责加载、独立数字皮肤、并发绘制及清理；`$damagepop` 统一触发受伤和数字，保留录像及广播。移除旧的真实伤害数字技能和资源预加载，抑制伤害期间原生火雷粒子及冰杀的重复受伤层。回血、失去体力及虚拟伤害保留各自的独立入口。

资源随扩展离线提供，复用模块内 Spine 4 运行库，不修改全局动态皮肤运行库。关闭动画、切换后台、对局结束及角色节点移除时停止相应效果；动画不改变游戏结算等待。

验证：`node --test tests/source-damage-effects.test.mjs tests/source-skill-popup.test.mjs tests/source-card-compilation.test.mjs tests/source-card-animations.test.mjs tests/settlement-optimization.test.mjs`。浏览器验证覆盖普通、火、雷、冰、两位及三位数字、同时播放、窗口缩放与结束清理。
