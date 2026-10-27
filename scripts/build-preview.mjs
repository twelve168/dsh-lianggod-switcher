/**
 * Offline visual preview generator.
 *
 * Loads the REAL client bundle through a micro-DOM, drives the presenter at
 * several depths, and records (a) the body custom properties and (b) the alias
 * token layer the theme override would apply. The emitted preview.html renders
 * those exact values, so what it shows is what the browser half will paint — without touching the running dsh web process.
 *
 *   node _build-preview.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/** Repository root: this script lives in scripts/, the preview lands next to README. */
const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(here, "index.js"), "utf8");
const cssStart = src.indexOf("const css = `") + "const css = `".length;
const css = src.slice(cssStart, src.indexOf("`;", cssStart));

function createStyle() {
    const values = new Map();
    return {
        setProperty(n, v) { values.set(n, v); },
        removeProperty(n) { values.delete(n); },
        getPropertyValue(n) { return values.get(n) ?? ""; },
        entries() { return [...values.entries()]; }
    };
}
function createElement(tag = "div") {
    return {
        tagName: tag.toUpperCase(), className: "", textContent: "", isConnected: false,
        offsetWidth: 100, children: [], dataset: {}, attributes: {}, style: createStyle(), parentNode: null,
        setAttribute(n, v) { this.attributes[n] = String(v); },
        getAttribute(n) { return this.attributes[n] ?? null; },
        hasAttribute(n) { return n in this.attributes; },
        removeAttribute(n) { delete this.attributes[n]; },
        appendChild(node) { this.append(node); return node; },
        append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } },
        prepend(...nodes) { for (const n of nodes) { n.parentNode = this; } this.children.unshift(...nodes); },
        remove() {
            if (this.parentNode) {
                this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
                this.parentNode = null;
            }
        },
        getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 40 }; },
        querySelector() { return null; }
    };
}

const head = createElement("head");
const body = createElement("body");
const documentElement = createElement("html");
const styles = [];
head.appendChild = (node) => { if (node.tagName === "STYLE") styles.push(node); };
const document = {
    head, body, documentElement, __styles: styles,
    createElement: (tag) => createElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
};
const windowStub = {
    __ModuleLoader__: null,
    localStorage: { getItem: () => null, setItem() {} },
    innerWidth: 1280,
    innerHeight: 800,
    document
};
document.defaultView = windowStub;

let registration = null;
windowStub.__ModuleLoader__ = { load: (value) => { registration = value; } };
const sandbox = { window: windowStub, document, console, module: { exports: {} }, exports: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox, { filename: "index.js" });

const React = {
    createElement: () => null, Fragment: "Fragment",
    useState: (v) => [typeof v === "function" ? v() : v, () => {}],
    useEffect() {}, useMemo: (f) => f(), useRef: (v) => ({ current: v }),
    useSyncExternalStore: (_s, g) => g()
};
client_boot();
function client_boot() {}

const client = registration.factory((spec) => {
    if (spec === "react") return React;
    throw new Error("unexpected require " + spec);
});

/** Drive the real presenter once per (scheme, depth) and capture its writes. */
function sample(scheme, depth) {
    const layers = [];
    const theme = {
        getTheme: () => ({ preference: scheme, active: { id: scheme, colorScheme: scheme, tokens: {} } }),
        overrideTokens: (_source, tokens) => { layers.push(tokens); return () => {}; }
    };
    const registered = [];
    const slots = {
        inject: (_key, cb) => {
            cb();
            return () => {};
        },
        register: (options, component) => {
            registered.push({ options, component });
            return () => {};
        }
    };
    const services = {
        slots,
        modelDirectories: {
            directoryFor: () => ({
                store: {},
                load: () => Promise.resolve(),
                select: () => Promise.resolve({ ok: true })
            })
        },
        sessions: { subagentAddress: () => undefined },
        settingsScope: {
            bind: () => ({
                getSnapshot: () => ({
                    status: "ready",
                    value: { background: true, portrait: true },
                    writable: true,
                    revision: 1
                }),
                subscribe: () => () => {},
                set: () => Promise.resolve(),
                unset: () => Promise.resolve(),
                load() {}
            })
        },
        theme
    };
    const queue = [];
    const scope = { get: (name) => services[name], effect: (factory) => { queue.push(factory()); return () => {}; } };
    const ctx = { get: scope.get, inject: (_deps, cb) => cb(scope), effect: scope.effect };
    client.apply(ctx);
    const seat = registered.find((entry) => entry.options.name === "conversation.input.model");
    const presenter = seat.options.inject("s1").presenter;
    presenter.setIdle(false);
    presenter.setLevel(depth, false);
    const vars = Object.fromEntries(body.style.entries());
    const tokens = {};
    for (const [name, pair] of Object.entries(layers.at(-1) ?? {})) tokens[name] = pair[scheme];
    presenter.dispose();
    for (const dispose of queue) dispose();
    for (const [name] of body.style.entries()) body.style.removeProperty(name);
    return { vars, tokens };
}

const DEPTHS = [
    { depth: 0, label: "0 · 小难梁" },
    { depth: 0.5, label: "15 · 梁圣" },
    { depth: 1, label: "30 · 梁祖" }
];
const SAMPLES = {
    light: DEPTHS.map((entry) => ({ ...entry, ...sample("light", entry.depth) })),
    dark: DEPTHS.map((entry) => ({ ...entry, ...sample("dark", entry.depth) }))
};

const UI_LIGHT = "--dsw-alias-label-primary:#17181a;--dsw-alias-label-secondary:#5e625e;--dsw-alias-label-tertiary:#8b8f8a;--dsw-alias-label-caption:#8b8f8a;--dsw-alias-border-l1:rgb(0 0 0 / 10%);--dsw-alias-border-l2:rgb(0 0 0 / 12%);--dsw-alias-border-inverted:rgb(0 0 0 / 8%);--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f6f7f9;--dsw-alias-interactive-bg-hover:rgb(0 0 0 / 5%);--dsw-alias-state-info-primary:#2f6fe4;--dsw-alias-button-primary-fill:#4c8dff;--dsw-shadow-lv3:0 8px 28px rgb(0 0 0 / 22%);--dsw-radius-sm:6px;--dsw-radius-lg:10px";
const UI_DARK = "--dsw-alias-label-primary:#f4f1e8;--dsw-alias-label-secondary:#b8b4a9;--dsw-alias-label-tertiary:#8d8a80;--dsw-alias-label-caption:#8d8a80;--dsw-alias-border-l1:rgb(255 255 255 / 12%);--dsw-alias-border-l2:rgb(255 255 255 / 16%);--dsw-alias-border-inverted:rgb(255 255 255 / 16%);--dsw-alias-bg-layer-1:#22232a;--dsw-alias-bg-layer-2:#1b1c22;--dsw-alias-interactive-bg-hover:rgb(255 255 255 / 8%);--dsw-alias-state-info-primary:#8fb8ff;--dsw-alias-button-primary-fill:#4c8dff;--dsw-shadow-lv3:0 8px 28px rgb(0 0 0 / 22%);--dsw-radius-sm:6px;--dsw-radius-lg:10px";

const varStyle = (entry, scheme) => [
    Object.entries(entry.vars).map(([k, v]) => `${k}:${v}`).join(";"),
    Object.entries(entry.tokens).map(([k, v]) => `${k}:${v}`).join(";"),
    scheme === "dark" ? UI_DARK : UI_LIGHT
].join(";");

const CHEVRON_DOWN = "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382C5.55843 8.90706C5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732C6.59876 8.24849C6.74023 8.3623C6.87291 8.46904C6.92272 8.47813C6.9375 8.48047C6.97895 8.48703C7.02105 8.48703C7.0625 8.48047C7.07728 8.47813C7.12709 8.46904C7.25977 8.3623C7.40124 8.24849C7.57405 8.07732C7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z";
const CHEVRON_RIGHT = "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843C9.13382 5.78438C9.29785 5.98828C9.46883 6.20088C9.61756 6.44405C9.66602 6.75C9.69222 6.91565C9.69222 7.08435C9.66602 7.25C9.61756 7.55595C9.46883 7.79912C9.29785 8.01172C9.13382 8.21561C8.90706 8.44157C8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405C8.24849 7.40124C8.3623 7.25977C8.46904 7.12709C8.47813 7.07728C8.48047 7.0625C8.48703 7.02105C8.48703 6.97895C8.48047 6.9375C8.47813 6.92272C8.46904 6.87291C8.3623 6.74023C8.24848 6.59876C8.07732 6.42595C7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z";
const RHEOSTAT = "M1.75 4.25h1.1a1.05 1.05 0 0 1 1.95 0h1.6a1.05 1.05 0 0 1 1.95 0h1.55a1.05 1.05 0 0 1 1.95 0h1.1v5.5h-1.1a1.05 1.05 0 0 1-1.95 0h-1.55a1.05 1.05 0 0 1-1.95 0h-1.6a1.05 1.05 0 0 1-1.95 0h-1.1v-5.5Z";

// Anchor table straight out of index.js, so the preview can never drift from
// the shipped mapping.
const ANCHORS = [...src.matchAll(/\{ level: (\d+), file: "([^"]+)" \}/g)]
    .map((match) => ({ level: Number(match[1]), file: match[2] }));
if (ANCHORS.length !== 24) throw new Error(`expected 24 portrait anchors, found ${ANCHORS.length}`);

function nearestAnchor(level) {
    let best = ANCHORS[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const anchor of ANCHORS) {
        const delta = Math.abs(anchor.level - level);
        if (delta < bestDelta || (delta === bestDelta && anchor.level > level)) {
            best = anchor;
            bestDelta = delta;
        }
    }
    return best;
}

const card = (entry, scheme) => {
    const [levelText, rank] = entry.label.split(" · ");
    const level = Number(levelText);
    const anchor = nearestAnchor(level);
    return `
  <figure class="sample" style="${varStyle(entry, scheme)}">
    <div class="dsh-lg-backdrop" data-on="1" style="position:absolute;inset:0;z-index:0">
      <div class="dsh-lg-aurora"></div>
      <div class="dsh-lg-portrait"><img data-active="1" src="assets/portrait/${anchor.file}" alt=""></div>
    </div>
    <div class="frame">
      <div class="sidebar"><span></span><span></span><span></span><span></span></div>
      <div class="center">
        <div class="bubble">推理深度 ${levelText}，背景与人物跟着换。</div>
        <div class="composer">
          <span class="placeholder">给 DeepSeek 发消息…</span>
          <div class="dsh-lg-root">
            <button class="dsh-lg-trigger" type="button">
              <svg class="dsh-lg-glyph" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="${RHEOSTAT}" fill="currentColor" opacity=".85"/></svg>
              <span class="dsh-lg-label">DeepSeek V4</span>
              <span class="dsh-lg-rank">${rank}</span>
              <svg class="dsh-lg-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="${CHEVRON_DOWN}" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <figcaption>${scheme} · ${entry.label} · ${anchor.file}</figcaption>
  </figure>`;
};

const card3 = (entry, scheme) => {
    const next = SAMPLES[scheme][Math.min(SAMPLES[scheme].length - 1, SAMPLES[scheme].indexOf(entry) + 1)];
    return card(entry, scheme) + (next === entry ? "" : card(next, scheme));
};

/**
 * The depth panel. `state` renders the two meaningful moments: `settled` (the
 * thumb sits on a committed depth) and `previewing` (a stepless drag is in
 * flight, the hint says where the release will land).
 */
const panel = (entry, scheme, state = "settled") => {
    const ratio = state === "previewing" ? 0.62 : Number(entry.label.split(" · ")[0]) / 30;
    const left = `calc(${(ratio * 100).toFixed(1)}% + ${Math.round(16 - 32 * ratio)}px)`;
    const level = ratio * 30;
    const nearest = [0, 15, 30][Math.round(ratio * 2)] ?? 15;
    const rank = ["小难梁", "牢梁", "梁子", "梁圣", "梁神", "梁祖"][Math.min(5, Math.floor(level / 6))];
    const effortName = nearest === 30 ? "High" : nearest === 15 ? "Medium" : "Low";
    const ticks = [0, 1, 2, 3, 4].map((index) => {
        const on = index <= Math.round(ratio * 4);
        const current = index === 2;
        return `<span class="dsh-lg-tick" data-on="${on ? "1" : "0"}" data-current="${current ? "1" : "0"}"></span>`;
    }).join("");
    const desc = state === "previewing"
        ? `<p class="dsh-lg-desc">thorough</p>`
        : `<p class="dsh-lg-desc">思考越长，背景越烫。</p>`;
    return `
  <div class="panelDemo" style="${varStyle(entry, scheme)}">
    <div class="dsh-lg-panel" style="position:static">
      <button class="dsh-lg-row" type="button"><span class="dsh-lg-rowKey">模型</span><span class="dsh-lg-rowValue">DeepSeek V4</span><svg class="dsh-lg-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="${CHEVRON_RIGHT}" fill="currentColor"/></svg></button>
      <div class="dsh-lg-divider"></div>
      <div class="dsh-lg-sliderBox">
        <div class="dsh-lg-sliderHead"><span>推理深度</span><strong>${rank} · ${effortName}</strong></div>
        <div class="dsh-lg-rail" data-dragging="${state === "previewing" ? "1" : "0"}" data-previewing="${state === "previewing" ? "1" : "0"}">
          <div class="dsh-lg-plate"></div>
          <div class="dsh-lg-windings"></div>
          <div class="dsh-lg-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>
          <div class="dsh-lg-knob" style="left:${left}"><div class="dsh-lg-knobCap"></div></div>
          <div class="dsh-lg-ticks">${ticks}</div>
        </div>
        ${desc}
      </div>
    </div>
  </div>`;
};

/** The 设置 → 插件 → 插件配置 card, with all three switches. */
const settingsCard = (scheme, modes = { background: true, portrait: true, persistent: true }) => {
    const ui = scheme === "dark" ? UI_DARK : UI_LIGHT;
    const row = (label, hint, on) => `
        <div class="dsh-lg-cardRow">
          <span class="dsh-lg-cardRowText">
            <span class="dsh-lg-cardRowLabel">${label}</span>
            <span class="dsh-lg-cardRowHint">${hint}</span>
          </span>
          <button class="dsh-lg-switch" data-on="${on ? "1" : "0"}" type="button"><span class="dsh-lg-switchKnob"></span></button>
        </div>`;
    return `
  <div class="settingsDemo" style="${ui}">
    <ul class="settingsList">
      <li class="dsh-lg-card">
        <div class="dsh-lg-cardHead">
          <span class="dsh-lg-cardTitle">梁神滑动变阻器</span>
          <span class="dsh-lg-cardDesc">把输入区的模型入口换成推理深度滑动变阻器；下面三项各自决定换档时要不要改外观、以及改多久。</span>
        </div>
        ${row("背景颜色", "换档时重染整页底色、发光、表面与主色按钮", modes.background)}
        ${row("背景人物", "换档时切换人物图；单独开启时人物浮在原生底色上", modes.portrait)}
        ${row("常驻显示", modes.persistent
            ? "关闭后只在拖动变阻器时出现，吸附后停留 0.75 秒即淡出，其余时间回到原生外观"
            : "当前只在拖动变阻器时与吸附后 0.75 秒内出现，之后自动淡出", modes.persistent)}
      </li>
    </ul>
  </div>`;
};

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-lianggod-switcher · 离线预览</title>
<style>${css}</style>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 26px 28px 40px; background: #eef0f3; color: #17181a;
       font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
h1 { margin: 0 0 4px; font-size: 19px; }
p.lede { margin: 0 0 20px; color: #5e625e; font-size: 12.5px; line-height: 19px; }
h2 { margin: 24px 0 10px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #6a6f6a; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.sample { position: relative; margin: 0; height: 240px; overflow: hidden; border-radius: 14px;
          corner-shape: round; isolation: isolate; box-shadow: 0 10px 28px rgb(0 0 0 / 16%); }
.frame { position: relative; z-index: 1; display: grid; grid-template-columns: 88px 1fr; height: 100%; }
.sidebar { display: flex; flex-direction: column; gap: 8px; padding: 14px 10px;
           background: var(--dsw-specific-sidebar-fill); border-right: 1px solid var(--dsw-alias-border-l1); }
.sidebar span { height: 7px; border-radius: 4px; background: var(--dsw-alias-label-secondary); opacity: .45; }
.sidebar span:nth-child(1) { width: 82%; } .sidebar span:nth-child(2) { width: 58%; }
.sidebar span:nth-child(3) { width: 72%; } .sidebar span:nth-child(4) { width: 44%; }
.center { display: flex; flex-direction: column; justify-content: flex-end; gap: 10px; padding: 14px; min-width: 0; }
.bubble { align-self: flex-start; max-width: 82%; padding: 7px 10px; border-radius: 10px;
          background: var(--dsw-specific-bubble); font-size: 12px; line-height: 18px; }
.composer { display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 7px 7px 7px 11px; border-radius: 13px; border: 1px solid var(--dsw-alias-border-l1);
            background: var(--dsw-specific-input-major); }
.placeholder { color: var(--dsw-alias-label-caption); font-size: 12px; white-space: nowrap; }
figcaption { position: absolute; z-index: 2; left: 10px; top: 9px; padding: 2px 8px; border-radius: 999px;
             background: rgb(0 0 0 / 45%); color: #fff; font-size: 10.5px; letter-spacing: .04em; }
.panels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
/* The shipped layer sizes itself in vw; inside a thumbnail card use a share of
   the card instead so the composition reads like the real page. */
.sample .dsh-lg-portrait { width: 56% !important; }
.panelDemo { padding: 14px; border-radius: 14px; background: var(--dsh-lg-panel);
             box-shadow: 0 10px 28px rgb(0 0 0 / 12%); }
.panelDemo .dsh-lg-panel { width: 100%; animation: none; box-shadow: none; }
.settingsDemo { padding: 16px; border-radius: 14px; background: var(--dsw-alias-bg-layer-2); }
.settingsDemo .settingsList { max-width: 560px; }
.settingsDemo .dsh-lg-switch { transform: scale(1.15); transform-origin: right center; }
.settingsDemo[style*="--dsw-alias-label-primary:#f4f1e8"] { background: #17181c; }
</style></head>
<body>
<h1>dsh-lianggod-switcher · 离线预览</h1>
<p class="lede">全部颜色由真实客户端 bundle 生成：背景自定义属性来自 presenter 的实际写入，表面/主色来自其 token 覆盖层。前两行为「浅色 / 深色 × 三档深度」的整页观感，第三行为换档面板与变阻器本体，最后一行为 设置 → 插件 → 插件配置 里的设置卡片。</p>
<h2>浅色 · 0 / 15 / 30</h2>
<div class="grid">${SAMPLES.light.map((entry) => card(entry, "light")).join("")}</div>
<h2>深色 · 0 / 15 / 30</h2>
<div class="grid">${SAMPLES.dark.map((entry) => card(entry, "dark")).join("")}</div>
<h2>面板与变阻器</h2>
<div class="panels">${panel(SAMPLES.light[1], "light")}${panel(SAMPLES.dark[1], "dark", "previewing")}${panel(SAMPLES.light[2], "light")}</div>
<h2>设置 → 插件 → 插件配置</h2>
<div class="panels">${settingsCard("light")}${settingsCard("dark")}${settingsCard("light", { background: false, portrait: true, persistent: true })}</div>
<h2>常驻关闭时（只在拖动 / 吸附后 0.75s 出现）</h2>
<div class="panels">${settingsCard("light", { background: true, portrait: true, persistent: false })}${settingsCard("dark", { background: true, portrait: true, persistent: false })}</div>
</body></html>`;

writeFileSync(join(here, "preview.html"), html, "utf8");
console.log("preview.html:", html.length, "bytes");
console.log("light@0  base:", SAMPLES.light[0].vars["--dsh-lg-base"], "accent:", SAMPLES.light[0].vars["--dsh-lg-accent"]);
console.log("light@30 base:", SAMPLES.light[2].vars["--dsh-lg-base"], "accent:", SAMPLES.light[2].vars["--dsh-lg-accent"]);
console.log("dark@15  base:", SAMPLES.dark[1].vars["--dsh-lg-base"], "accent:", SAMPLES.dark[1].vars["--dsh-lg-accent"]);
console.log("layer-1  :", SAMPLES.light[1].tokens["--dsw-alias-bg-layer-1"]);
console.log("brand    :", SAMPLES.light[1].tokens["--dsw-alias-brand-primary"]);
