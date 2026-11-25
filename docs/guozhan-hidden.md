# 国战暗将牌面

未明置的主将、副将分别使用原版灰白“将”字及浪纹牌底，保留 HH优化当前主题的武将边框、名字栏、体力及势力显示。副将未明置时显示“副将”。

当前玩家能看到自己的原画像和武将名，并在未明置的一侧叠加原版黑色横纹与蓝色“潜伏”字图。明置主将只移除左侧遮罩，明置副将只移除右侧遮罩；重新暗置或暗置换将时随引擎状态恢复。已明置武将沿用 HH优化原有势力栏。

旁观及录像使用公开视角；切换控制角色后，仅当前玩家使用画像遮罩。选将预览、武将浏览和其他模式不使用这套暗将牌面。显示模块不读取他人的未公开武将、势力或技能，也不修改游戏规则。

## 原始资源

四张 PNG 均直接复制，原始路径、SHA-256 和对应代码记录在 `assets/guozhan-hidden/sources.json`。

| 文件 | 原始目录 | 用途 |
| --- | --- | --- |
| `general_unkown_l.png` | `E:\AI\sanguosha\extract\unity\sprite\assets\res\picture\game\seatbottom` | 主将灰白牌底 |
| `general_unkown_r.png` | 同上 | 副将灰白牌底 |
| `general_luck_mask_l.png` | `E:\AI\sanguosha\extract\unity\sprite\assets\res\picture\game\seat` | 半透明横纹遮罩 |
| `general_luck_mask.png` | 同上 | 75×43 蓝色“潜伏”字图 |

## 原始逻辑

来自 `E:\AI\sanguosha\sanguosha2\work\main.js`：

- `iTs.initUnkownBg`、`UpdateUnknowBg`：分别建立主副将暗牌底图，根据对应武将的可见性显示；原布局使用 72×226，主将起点 x=26，副将起点 x=26+头像总宽/2。
- `Tns.SetGeneralState`、`createZhuGeneralState`、`createFuGeneralState`、`layout`：按主副将分别创建或移除横纹及“潜伏”；遮罩高 227，“潜伏”以原始 75×43 比例在对应牌面居中。
- `N5i.General_CardChanged`、`updateCountry`、`updateIsHalfShow`：本方保留画像，明置状态控制遮罩；旁观时依据可见权限决定画像显示。
- `dCs.initCountry`、`ShowCountry`、`ShowFuGeneralName`：未公开时分别显示“主将”和“副将”。

## 接入

`src/ui/guozhanHidden.js` 将原版显示规则映射到引擎的 `unseen`、`unseen2`，在原有头像内放置独立牌底与遮罩，不改写头像背景、武将数据或技能。开局前预载四张图，避免牌底或“潜伏”延迟出现。

`src/styles/guozhan-hidden.css` 适配六种主题。扣除势力栏后，主、副将各占剩余头像区域的一半，使用相同的高度及顶边，不再沿用原主题相互重叠或宽窄不同的头像框。原始右牌底比左牌底多一像素宽、高，显示时按相同的原图像素比例对齐，使“将”字和浪纹处于同一基准。字图保持原始比例；动皮跟随同一头像区域并按公开的半边裁剪，露头图在我方暗将处保留画像。

验证：

```sh
node --test tests/guozhan-hidden.test.mjs tests/guozhan-identity.test.mjs tests/guozhan-selection.test.mjs
```
