> 说明：本目录的人像图片**不是**本仓库作者的原创作品，版权归属见仓库根目录的
> [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。如果你要再分发本仓库，
> 请先确认上游素材的授权。

# assets/portrait

24 张人像锚点，文件名与 `host.js` 的 `PORTRAIT_FILES`、`index.js` 的 `PORTRAIT_ANCHORS`
一一对应，铺在同一条 0–30 的「推理深度」轴上（2/5/8/11/20/23/26 没有独立帧）：

```text
stage-00 · level-01 · level-03 · level-04 · stage-06 · level-07 · level-09 · level-10
stage-12 · level-13 · level-14 · bridge-15 · level-16 · level-17 · stage-18 · level-19
level-21 · level-22 · stage-24 · level-25 · bridge-27 · level-28 · level-29 · stage-30
```

换成自己的图：**保持文件名不变**，直接替换同名 WEBP 即可，不需要改代码。建议竖构图、
高度 ≥ 800px、主体偏右（右侧约 42–54vw 会被遮罩渐隐，左缘不会压住对话列）。

要改数量或命名，同时修改：

- `host.js` 的 `PORTRAIT_FILES`（决定注册哪些静态路由）
- `index.js` 的 `PORTRAIT_ANCHORS`（决定每个文件名对应哪一档深度）

宿主路由在**进程启动时**建立，所以换图后要重启 `dsh web`。
如果把本目录清空，插件不会报错——它会自动退化成「只有配色、没有人物」。
