# 武将牌技能提示

普通武将技能触发时，在武将牌中央播放原版墨迹条和白色书法技能名，替换旧的两侧飞入文字。直接沿用 `$damagepop` 技能提示入口、联机广播及录像记录，不增加设置项。

资源取自本机 `E:/AI/sanguosha/sanguosha2/yoka.game_g_android_4.0.2.apk` 的 Laya 缓存：

| 原路径 | 缓存键 |
| --- | --- |
| `/res/assets/animate/game/skill/general/putongchufa.png` | `31f2153a` |
| `/res/assets/animate/game/skill/general/putongchufa.atlas.txt` | `3f63fb80` |
| `/res/assets/animate/game/skill/general/putongchufa.skel` | `7673e6de` |
| `/res/assets/font/HYF3GJM.ttf` | `4bd66369` |

使用 Spine 4.0.56 的 `play2` 普通攻击技能触发动画。其末段 `chaobianheti/chaobianheti_00035` 是参考截图中的黑色墨迹；前段保留原版金色扫光。原客户端在 300ms 的 `chuxian` 事件显示技能名，150ms 内从两侧合拢，1000ms 的 `xiaoshi` 事件开始淡出，约 1167ms 结束。

以原骨骼姿态每秒 30 帧采样，保留透明度并裁切透明留白，生成 `assets/skill-popup/skill-trigger.png` 的 36 帧横向图。原始图集、骨骼和每帧哈希均随资源保留，见同目录 `sources.json`。原字体完整无损压缩为 WOFF2，没有按技能名裁剪字库。运行时通过 CSS 单次播放，不另外创建 Spine 或 WebGL 实例。

同一武将连续触发会替换上一条，不会重复叠加；其他武将可以各自显示。动画结束、对局结束或页面隐藏会清除节点及计时器。关闭游戏动画或系统要求减少动态效果时，使用可见的黑色停留帧与完整技能名。

2.0.38 将墨迹和技能名一起放入 `ui.window` 的独立浮层，与铁索动画共用父节点，层级为 91，高于链条的 90，避免受武将牌及牌桌内部层叠上下文限制。每帧按武将牌和浮层的实际边界换算位置及缩放，保留原来的中心、尺寸比例、字体大小和动画时序；武将移出界面时也会清理节点、计时器及帧回调。

伤害和回复动画、限定技/觉醒技的全屏特效，以及已注册专用特效的技能继续沿用原有入口。武将牌下方的思考提示不受影响。

验证包含资源哈希和骨骼事件核对、实际游戏 `trySkillAnimate → popup → $damagepop` 方法链、连续触发/多武将清理、关闭动画及其他动画入口回归。已查看原始帧图；浏览器安全策略禁止打开本地预览文件，本次未完成浏览器及实际对局目测。

2.0.38 补充浏览器验证：通过本地 HTTP 预览加载实际铁索骨骼及水墨资源，覆盖六种武将主题、横竖屏及界面缩放共 18 种组合，核对技能名可见、链条上方的绘制顺序、中心和尺寸比例及浮层清理。检查脚本、截图及结果保存在工作区 `artifacts/hh-skill-chain-layer-20261128/`。
