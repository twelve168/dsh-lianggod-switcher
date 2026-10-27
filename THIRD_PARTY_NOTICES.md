# 第三方素材声明 · Third-Party Notices

本仓库的**代码**（`index.js`、`host.js`、`cordis.patch.yml`、`test/`、`scripts/`）由本仓库作者编写，以 MIT 许可发布（见 `LICENSE`）。

`assets/portrait/*.webp`（24 张人像）**不适用 MIT 许可**，它们是第三方素材：

| 项目 | 说明 |
|---|---|
| 直接来源 | [kingOfSoySauce/dsh-liang-skin](https://github.com/kingOfSoySauce/dsh-liang-skin) 的 `assets/portrait-source-v2/` |
| 上游来源 | 该项目自述其「滑动变祖」视觉概念与人物素材源自 [Lichtspektrum/liang-intensity-calibrator](https://github.com/Lichtspektrum/liang-intensity-calibrator) |
| 用途 | 本仓库仅为「随深度切换人物」这一功能附带运行所需的锚点图，未作商业用途主张 |
| 授权状态 | **上游未明确声明可再分发的许可**（截至打包时）。若你要 fork、再发布或商用，请先自行确认授权；若不确认，请删除 `assets/portrait/*.webp` |

删除人像不会破坏插件：宿主半边在素材目录为空时不会注册任何静态路由，浏览器半边取不到图就只显示配色与变阻器，其余功能（无极拖动、吸附、三个设置开关）照常工作。也可以按 `assets/portrait/README.md` 换成你自己拥有版权的图片。

其余第三方名词：

- DeepSeek Harness（DSH）、Cordis 为各自权利人所有，本仓库只以插件形式扩展它们。
- 档位命名「小难梁 / 牢梁 / 梁子 / 梁圣 / 梁神 / 梁祖」沿用自上述上游项目的设定，仅作致敬与一致性用途。
