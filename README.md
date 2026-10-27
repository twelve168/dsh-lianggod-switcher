# dsh-lianggod-switcher · 梁神滑动变阻器

**中文** | [English](README.en.md)

把 DeepSeek Harness（DSH）Web 端输入区的模型选择器换成一台**无极滑动变阻器**：拖动时背景与人物连续跟手、按顺序走完全部外观；**只有松手才吸附**到最近的可用思考深度并提交给模型。背景配色、人物、以及「什么时候显示」都由 **设置 → 插件 → 插件配置** 里的三个开关控制。零运行时依赖——插件本体就是 `index.js` + `host.js` 两个文件和 24 张 WEBP 锚点图。

![浅色 / 深色 × 三档深度](docs/preview.png)

![设置 → 插件 → 插件配置](docs/settings.png)

想看完整效果不必先装：仓库根目录的 [`preview.html`](preview.html) 是离线生成的静态预览（浅色/深色 × 三档深度、变阻器本体、设置卡片），双击即可打开。它由 `npm run preview` 从真实 `index.js` 重新生成；上面两张图就是它的截图。

## 改编自

本插件不是从零写的：它把两个社区插件的思路合到一起再改造，人像素材也沿用其中之一。

- 改编自 **[lemonorangeapple/dsh-effort-switcher](https://github.com/lemonorangeapple/dsh-effort-switcher)** —— 接管 `conversation.input.model` 模型座位、拖动只预览 / 松手才提交 `reasoningEffort` 的交互骨架来自它。
  **改动**：把**离散档位滑块换成 0–1000 的无级旋钮**（原插件一个档位一格）；轨道、陶瓷底板、绕线纹与旋钮全部重绘为「变阻器」；补上方向键整档跳转 / Home-End / Esc 放弃，以及「已提交档位」白点标记；面板底部的开关移除，改到设置页统一管理。

- 改编自 **[kingOfSoySauce/dsh-liang-skin](https://github.com/kingOfSoySauce/dsh-liang-skin)** —— 0–30 深度轴、六段色板、「小难梁 → 梁祖」档位命名、24 张人像锚点与「深度换背景」的整体观感来自它（该皮肤又注明素材源自 [Lichtspektrum/liang-intensity-calibrator](https://github.com/Lichtspektrum/liang-intensity-calibrator)）。
  **改动**：「背景」与「人物」拆成**两个独立开关**（原皮肤是整套外观一起开关，开关本身是插进原生 `设置 → 通用设置 → 外观` 那一行的一格按钮）；新增第三个**「常驻显示」开关**，关掉后只在拖动时与吸附后 750ms 出现，其余时间完全回到原生外观；人物换图从「直接换成最近锚点、无过渡」改成**重叠交叉淡入**；配色从「只分浅/深两个阶段」改成**随深度连续插值**；背景层改为 `body` 之下 `z-index:-1` 的固定图层 + alias token 覆盖，素材由插件自己的 `webServer` 精确路由提供，不再往原生外观行里插入 DOM。

两者都没有、本插件新增的部分：无极拖动与松手吸附的分离、键盘整档跳转、三个开关以 **Host settings** 形式注册进 **设置 → 插件 → 插件配置**（随 profile 持久化）、人物/配色/显隐彼此正交、以及两套无头自检与离线预览生成器。

## 功能

| 能力 | 说明 |
|---|---|
| **无极变阻器** | 旋钮无级（输入域 0–1000，`step=1`）：拖动期间旋钮 1:1 跟手、背景与人物连续流动，不是一格一格地跳。刻度点只标出可用的思考深度 |
| **松手才吸附** | 拖动期间**不写模型、不吸附**；松手（或键盘确认、失焦）才吸附到最近档位：旋钮磁吸缓动弹到该档、背景定在该档并保持。落回原档时不写模型，只把背景复位 |
| 拖动提示 | 当前**已提交**的档位用加粗白点标出，拖动时旋钮外圈高亮；不出现任何「预览模式」文字 |
| 键盘 | ←/→/↑/↓ 一次走一整档（不是 1/1000 的原始步长），Home/End 直达两端，Esc 放弃本次拖动且不写入 |
| 深度轴 | 任意 N 个档位均匀铺在 0–30 上（2 档 = 0/30，3 档 = 0/15/30，5 档 = 0/7.5/15/22.5/30） |
| 档位名 | 小难梁 / 牢梁 / 梁子 / 梁圣 / 梁神 / 梁祖，随深度连续插值，与模型原生档位名并列显示 |
| 背景切换 | 拖动时背景随深度连续流动；提交时播放一次径向光晕；六段色板（冰蓝 → 靛蓝 → 紫 → 品红 → 橙红 → 金） |
| 人物 | 24 张深度锚点人像（`stage-00 … stage-30`）铺在同一条 0–30 轴上，切换时做**重叠交叉淡入**（新图淡入 240ms 与旧图淡出 380ms 同时进行，不会先空一帧），尺寸与不透明度随深度增加；左缘用遮罩淡出，不压住对话列 |
| 表面联动 | 通过 `ctx.theme.overrideTokens` 重着色 `bg-base`/`bg-layer-1..3`/侧边栏/输入卡片/气泡/品牌色：背景透出来，按钮跟档位变色 |
| 模型切换 | 面板内仍保留完整模型列表（本插件接管了原生座位，不保留就没法换模型） |
| 三个设置开关 | 「背景颜色」「背景人物」「常驻显示」都在 **设置 → 插件 → 插件配置** 里；换档面板里没有任何开关 |

不支持推理或只有一个档位的模型不显示滑块（座位仍然提供模型切换）。addressed subagent 会话不渲染该座位。

## 设置项

入口：**设置 → 插件 → 插件配置 → 梁神滑动变阻器**（和 Bash 超时、Web 搜索等卡片在同一页）。

| 开关 | 默认 | 效果 |
|---|---|---|
| 背景颜色 | 开 | 换档时重染整页底色、两团发光、分层表面、侧边栏、输入卡、气泡与主色按钮；关掉后界面回到你自己的主题配色 |
| 背景人物 | 开 | 换档时按最近锚点做重叠交叉淡入，宽度与不透明度随深度增加；**只开这一项**时页面保留原生底色（插件只把画布打通，不重着色任何表面），人物浮在其上 |
| 常驻显示 | 开 | 开＝背景与人物一直贴在页面上（上面两项各自说了算）；关＝**只在按住变阻器拖动期间**出现，松手吸附后停留 **750ms** 再淡出（淡出 320ms），其余时间完全回到原生外观，DOM 里连图层都不留 |

前两项都关掉时插件不往 DOM 画任何东西（只保留输入区的滑动变阻器本体），档位仍照常提交给模型。「常驻显示」只决定**什么时候显示**，不改变「显示什么」。

- 值存在 Host 的 settings 文档（`<DSH_HOME>/settings.yaml` 的 `lianggod-switcher:` 段），按 profile 生效、跨浏览器同步，刷新/重启都保留。
- 通过非回环地址（局域网/隧道）打开 GUI 时，DSH 的 settings 写入是进程内内存态（宿主只把回环连接当作可写），此时开关**可读不可持久**——这是宿主 settings 传输的既有约束，不是本插件的选择。
- 宿主未提供 settings 服务时（例如只装了客户端半边），三项按默认值（都开）应用，卡片不出现在设置页。
- 也可以在 `cordis.patch.yml` 的插件行里写默认值——它作为 settings 的 `base` 层，用户文档里的值再覆盖它：

  ```yaml
  - id: lianggod-switcher
    name: dsh-lianggod-switcher
    config:
      portrait: false
  ```

## 安装

在插件仓库目录里执行（`<本仓库路径>` 换成实际路径）：

```sh
dsh plugin --profile web add <本仓库路径>
# 发布到 GitHub 之后也可以：dsh plugin --profile web add github:<user>/dsh-lianggod-switcher
```

然后**完全重启** `dsh web`（客户端 bundle 只在 Web 进程启动时扫描进 boot graph），重启后刷新 `http://127.0.0.1:3080`。

不需要手改 profile 的 `cordis.patch.yml`：`package.json` 的 `dsh.bundle.patch` 会自动插入 loader 行。

只改 `index.js`（纯客户端）时刷新页面就生效——bundle 路由每次都从磁盘读；改 `host.js`（静态路由 / settings schema）才需要重启进程。

验证：

```sh
dsh --profile web --dump-config | grep lianggod-switcher
npm test        # 客户端 + 宿主两套自检
```

卸载：

```sh
dsh plugin --profile web remove dsh-lianggod-switcher
```

## 兼容性

- 在 **DSH `0.1.0-rc.7`** 的 Web profile 上开发与实测。
- 用到的宿主契约：`conversation.input.model` 单座位（`priority` 低的渲染）、`modelDirectories.directoryFor(sessionId)`、`ctx.theme.overrideTokens`、`ctx.webServer.register`（`exact` 路由）、`ctx.settings.register` + 浏览器侧 `ctx.settingsScope.bind`、`settings.plugin.item`（keyed，按 Host 服务的命名空间派发）。宿主版本变动时优先检查这几处。

## 实现要点

- **宿主半边不只做挂载**（`host.js`）：`dsh.client` 只能暴露一个脚本（bundle），二进制素材需要真的 HTTP 路由。宿主用 `ctx.webServer.register({ kind: "exact", path })` 逐个注册 24 张人像（`/plugins/dsh-lianggod-switcher/assets/portrait/*.webp`，带 ETag、`304`、卸载时打断残留流）。
- **人物就近取锚点**：24 个锚点铺在 0–30 轴上（2/5/8/11/20/23/26 没有独立帧），始终取**已解码**锚点里最近的那张，失败回退到次近。
- **交叉淡入是重叠的，不是接力**：换图时在**同一个 tick** 里给旧帧 `data-leaving="1" + data-active="0"`、给新帧 `data-active="1"`；旧帧过渡拉长到 380ms、新帧 240ms ease-out，两张图的透明度曲线有 240ms 完全重叠，不会出现「先空一帧再淡入」。切帧前先 `img.decode()`，保证新帧有像素之后才动透明度；`onload` 带代次 token，快速拖动时只有最后一次生效。
- **座位接管**：`slots.register({ name: "conversation.input.model", priority: -100, inject: (sessionId) => … })`；`priority` 越小越优先，单座位只渲染一个占用者，因此原生模型选择器不再渲染。
- **设置卡片进的是官方座位**：`设置 → 插件 → 插件配置` 那一页（`settings.plugin.item`，keyed）只派发 **Host 真的在服务的 settings 命名空间**。所以宿主半边 `ctx.inject(["settings"], …)` 里 `settings.register("lianggod-switcher", schema)` 才是卡片出现的前提；浏览器半边用 `settingsScope.bind({ namespace })` 拿到同一命名空间的读写句柄，再以同一个字符串作为 `key` 注册卡片。
- **schema 是手写的**：`settings.register` 只把 schema 当函数调用（校验并补默认值）并读它的 `toJSON()`；`@deepseek-ai/schemastery` 只在 profile/deployment 里，用户目录装的插件 import 不到，塞第二份又会遮蔽共享实例。于是 `host.js` 自带一个等价实现，`toJSON()` 复刻 Schemastery 的 `{ uid, refs }` 信封；浏览器半边再用 `decode` 直读值，不依赖信封保真。
- **提交语义**：`directory.select({ provider, model, reasoningEffort })` 只有在 reject 或返回 `{ ok: false }` 时才算失败；提交期间到来的松手会被排队，不丢。
- **无极是怎么做的**：`<input type=range>` 取 `0..1000 step=1`，`t = value/1000` 直接喂给调色板插值与人物锚点选择，所以拖动时一切都连续；松手时 `nearest = round(t × (N−1))` 得到要提交的档位，随后把 `dragStep` 置 −1 让旋钮回到「已落位」的受控值——CSS 过渡把这次回弹变成看得见的磁吸。**拖动期间禁用过渡**（`[data-dragging="1"]`），否则旋钮会拖在指针后面。
- **常驻 / 临时是一个可见性闸门**：presenter 内部有 `revealed` + `draggingNow`，`live()` 在 `persistent: false` 时还要 `revealed` 才成立。按下变阻器 → `setDragging(true)` → `reveal()`；松手 → `setDragging(false)` → **750ms** 后把图层 `data-on="0"`（320ms 淡出），随后真正 unmount 并撤掉 token 层，页面回到原生外观。定时器都挂在 `document.defaultView` 上，`dispose()` 会取消。
- **背景是真的在 `body` 之下**：宿主用 `body{background:var(--dsw-alias-bg-base)}` 和 `.frame{background:var(--dsw-alias-bg-base)}` 画画布，插件把该 token 覆盖为 `transparent`，然后往 `<body>` 前插一个 `position:fixed; z-index:-1` 的图层——body 不是层叠上下文，负 z 就落在透明画布之上、所有定位面板之下。
- **可逆**：图层、`html[data-dsh-lianggod-background]`、十五个 body 自定义属性、token 覆盖层、settings 订阅都由同一个 fiber 的 disposer 收回；三个开关全关或卸载插件都不留痕。
- **性能**：拖动只写 body 自定义属性（rAF 合并），不触发 `theme/change`；只有提交档位才重新发布 token 层，避免整树重渲染。

## 开发

```sh
npm test        # test/verify-client.cjs（微 DOM + hook runtime 真渲染组件 + 可控定时器）
                # test/verify-host.cjs（起真 http server 打静态路由 + settings 命名空间与 schema）
npm run check   # 两个文件的语法检查
npm run preview # 从真实 index.js 生成 preview.html
```

仓库结构：

```text
index.js             浏览器半边：变阻器座位 + 背景/人物呈现器 + 设置卡片
host.js              宿主半边：settings 命名空间 lianggod-switcher + 人像静态路由
cordis.patch.yml     bundle patch：插入 id 为 lianggod-switcher 的 loader 行
package.json         exports["./client"]、dsh.bundle、dsh.client 元数据
assets/portrait/     24 张人像锚点（stage-00.webp … stage-30.webp，约 1.3 MB）
test/                两套无头自检
scripts/             离线预览生成器
preview.html         生成的静态预览（离线双击可看）
THIRD_PARTY_NOTICES.md  人像素材来源与授权说明
```

## 第三方素材

`assets/portrait/*.webp` 来自 [kingOfSoySauce/dsh-liang-skin](https://github.com/kingOfSoySauce/dsh-liang-skin)（该项目注明素材源自 [Lichtspektrum/liang-intensity-calibrator](https://github.com/Lichtspektrum/liang-intensity-calibrator)），**不适用本仓库的 MIT 许可**。详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；换图或删图的步骤见 [`assets/portrait/README.md`](assets/portrait/README.md)。删掉人像不会破坏插件，只会退化成「只有配色」。

## 已知边界

- `theme.overrideTokens` 把 `--dsw-alias-bg-base` 设为透明后，`meta[theme-color]` 会变成透明色（浏览器地址栏取色），代码块吸顶条、启动闪屏也会透出背景——与原皮肤同样的取舍。
- 人物图固定覆盖屏幕右侧约 42–54vw（随深度加宽）；若你在同一侧还装了别的装饰性挂件，两者会叠在一起。
- 三个开关是 Host settings，从非回环地址打开的 GUI 只能读到值、写不进去（宿主把非 loopback 连接当内存态）。
- 与其它皮肤插件同时启用时，后注册的 token 层胜出；不确定谁赢就不要同时开两个皮肤。
- 本插件不写会话日志、不新增模型可见输入，因此不影响 KV cache，也不需要新的 `SessionEventMap` 事件。

## License

代码以 [MIT](LICENSE) 发布。人像素材除外，见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
