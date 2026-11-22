# 选择目标时显示距离

手动选择卡牌或技能的目标时，在其他存活角色的武将牌下方显示“距离N”。数字通过无名杀 `get.distance(操作者, 目标)` 获取，包含坐骑、装备、技能及当前所选装备牌的修正，最小为 1。自己、死亡、离场、不计距离的角色以及自动指定全部目标的牌不显示。已选目标继续显示；取消、确认和对局结束时清除。

原版实现来自本机 `E:/AI/sanguosha/sanguosha2/work/main.js` 中 `otherTopManager` 的 `ShowOtherSeatDistance` 方法。该方法使用 `Dxt.Create(textSprite, "", 22, "#d1b594", 100, 16, null, false, 2, "#402E12")`，字距 1、居中，放在牌底下方 20 个设计像素。原版以 `GetSeatDistance + 1` 得到至少为 1 的距离；无名杀的 `get.distance` 已返回通常意义上的距离，因此直接使用，避免多加 1。

字体复用已从同一原版 APK 导入的 `assets/general-font/FZLBGBK.woff2`（来源及哈希见同目录 `sources.json`），这段文字没有独立图片素材。字号、字距、描边和底部间距按当前武将高度与原版 224px 牌高的比例缩放；使用 `hh-source-general` 字体和常规字重。

正常距离使用 `#d1b594` 填色和 `#402E12` 描边；超出用牌距离时使用原版 `#ff5252` 和 `#410404`。通过引擎 `lib.filter.targetInRange` 判断距离限制，保留武器范围、技能修改、视为牌和忽略距离规则。因无手牌等其他原因不可选的角色仍用正常颜色；普通不带距离限制的技能选择也使用正常颜色。

实现通过 `checkBegin`、`checkTarget`、`uncheckTarget` 和 `onover` 钩子管理提示，不修改目标过滤器和卡牌、技能规则。沿用 `_distanceDisplay` 引用以兼容现有诈死技能的显示控制。六种主题共用此样式。
