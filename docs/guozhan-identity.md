# 国战势力排除

国战武将牌左上角显示势力圆钮。点击展开吴、群、蜀、魏、晋；点击一项将其排除，再点恢复，每次操作后收起面板。排除项及圆钮对应扇区变灰，只剩一种时显示该势力的原版圆牌。点击空白处或按 Esc 收起。

每名角色的标记独立保存在引擎原有的 `_guozhanguess` 中，仅作为本地猜测。明置后改为实际势力并收起排除面板；自己、已明置角色、录像和已结束对局不开放排除。不会改写真实势力、武将、选将候选或 AI 判断。

图片来自 `E:\AI\sanguosha\extract\unity\sprite\assets\res\picture\game\seat\`：

- `countrywarforcebg.png`：面板边框。
- `countrywarforce_{wu,qun,shu,wei,jin}1.png`：原版势力选项。
- `countrywarforcemin_*`：小圆钮的势力色及灰色象限。
- `countrywarforceshow_*`：仅剩一种或已明置时的势力圆牌。

17 张 PNG 按原始字节复制至 `assets/guozhan-force/`，来源与 SHA-256 记录在其中的 `sources.json`。

原版逻辑位于 `E:\AI\sanguosha\sanguosha2\work\main.js` 的 `y5i` 类：`ShowForceOperate` 处理势力禁用，`showNormalForce` 显示未排除扇区及单势力圆牌，`showOperateForce` 展开选项，`onSureClick` 切换排除。`drs` 负责原版双列选项、边框、57×63 图块与点击空白收起。

默认同时提供五种势力：圆钮扩为五扇区，沿用原图采样色及原图外圈。面板按吴、群／蜀、魏／晋顺序排列，晋靠左承接下一行；边框按五个图块轮廓绘为阶梯多边形，晋右侧不保留空格。选项保持原始尺寸和文字比例。模式禁用一种势力时，按原版的四象限位置替换为晋，使用原版矩形边框。面板随游戏缩放定位并限制在窗口内，支持鼠标、触屏与键盘。

实现位于 `src/ui/guozhanIdentity.js`、`src/styles/guozhan-identity.css`。身份节点的原有文字结构仍由引擎维护；显示与输入由该模块接管，其他模式沿用原处理。

验证：

```sh
node --test tests/guozhan-identity.test.mjs tests/guozhan-selection.test.mjs
```
