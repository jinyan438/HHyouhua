# 国战势力排除

其他未明置的国战武将牌左上角显示势力圆钮。点击直接展开吴、群、蜀、魏、晋，不播放缩放过渡；点击一项将其排除，再点恢复，每次操作后收起面板。排除项及圆钮对应扇区变灰，只剩一种时显示该势力的原版圆牌。点击空白处或按 Esc 收起。

每名角色的标记独立保存在引擎原有的 `_guozhanguess` 中，仅作为本地猜测。明置后隐藏排除圆钮、收起面板，显示 HH优化当前主题原有的势力栏；单势力圆牌仅用于其他未明置角色的排除标记。自己视角的武将始终使用扩展原有势力栏，鼠标、触屏和键盘沿用原处理；切换控制后同步更新新旧角色的显示，并收起自己角色的排除面板。自己、已明置角色、录像和已结束对局不开放排除。不会改写真实势力、武将、选将候选或 AI 判断。

图片来自 `E:\AI\sanguosha\extract\unity\sprite\assets\res\picture\game\seat\`：

- `countrywarforcebg.png`：面板边框。
- `countrywarforce_{wu,qun,shu,wei,jin}1.png`：原版势力选项。
- `countrywarforcemin_*`：小圆钮的势力色及灰色象限。
- `countrywarforceshow_*`：其他未明置角色仅剩一种猜测时的势力圆牌。

17 张 PNG 按原始字节复制至 `assets/guozhan-force/`，来源与 SHA-256 记录在其中的 `sources.json`。

原版逻辑位于 `E:\AI\sanguosha\sanguosha2\work\main.js` 的 `y5i` 类：`ShowForceOperate` 处理势力禁用，`showNormalForce` 显示未排除扇区及单势力圆牌，`showOperateForce` 展开选项，`onSureClick` 切换排除。`drs` 负责原版双列选项、边框、57×63 图块与点击空白收起。

默认同时提供五种势力：圆钮扩为五扇区，沿用原图采样色及原图外圈。面板按吴、群／蜀、魏／晋顺序排列，晋靠左承接下一行；边框按五个图块轮廓绘为阶梯多边形，晋右侧不保留空格。面板宽度按参考图缩为武将牌宽度的约三分之二，最大不超过原始尺寸；图块、文字、间距和边框等比缩放，保留原始素材比例。默认 136 像素宽武将牌对应约 91×148 像素的五势力面板。模式禁用一种势力时，按原版的四象限位置替换为晋，使用原版矩形边框并沿用同一缩放比例。面板随游戏缩放定位并限制在窗口内，支持鼠标、触屏与键盘。

实现位于 `src/ui/guozhanIdentity.js`、`src/styles/guozhan-identity.css`。身份节点的原有文字结构仍由引擎维护；显示与输入由该模块接管，其他模式沿用原处理。

验证：

```sh
node --test tests/guozhan-identity.test.mjs tests/guozhan-selection.test.mjs
```
