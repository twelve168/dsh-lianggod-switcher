/**
 * dsh-lianggod-switcher — client half.
 *
 * Two things ride on one control:
 *
 *  1. A rheostat seat (`conversation.input.model`, priority -100) that replaces
 *     the stock model selector. Dragging is a pure visual preview; the release
 *     (or a keyboard commit) submits the neighbouring `reasoningEffort` through
 *     the official `modelDirectories` directory, exactly like the shipped
 *     selector does.
 *  2. A depth-driven background. Every depth owns a palette; the page backdrop
 *     repaints continuously while dragging and cross-flares on commit, and the
 *     DSH alias tokens are re-tinted through `ctx.theme.overrideTokens` so the
 *     surfaces (sidebar, composer, bubbles, primary buttons) follow the level.
 *
 * The backdrop works because the host paints `body{background:var(--dsw-alias-bg-base)}`:
 * overriding that token to `transparent` turns the page canvas into a window,
 * and a `position:fixed; z-index:-1` sibling (a child of body, so it stays in
 * body's stacking context and below every positioned panel) paints behind all
 * app content. Switching off removes the layer, the token layer and every
 * custom property this module wrote — nothing outlives the fiber.
 */
window.__ModuleLoader__.load({
    id: "dsh-lianggod-switcher",
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        const react = require("react");

        const name = "lianggod-switcher";
        const PLUGIN_ID = "dsh-lianggod-switcher";
        const slotName = "conversation.input.model";
        /**
         * `settingsScope` + `connection` + `remote` are what `settingsScope.bind()`
         * resolves on the CALLER's context to reach the settings transport; the
         * configurable-plugins tab only dispatches cards whose key is a namespace
         * the host serves, so the namespace string below must match host.js.
         */
        const inject = [
            "slots",
            "modelDirectories",
            "sessions",
            "settingsScope",
            "connection",
            "remote"
        ];
        const SETTINGS_NAMESPACE = "lianggod-switcher";
        const SETTINGS_SLOT = "settings.plugin.item";
        /** Appearance modes, each owned by one switch in the settings card. */
        const DEFAULT_MODES = Object.freeze({ background: true, portrait: true, persistent: true });

        // The virtual 0–30 depth axis shared with the reference skin: any number
        // of model efforts is spread evenly across it.
        const LEVEL_MAX = 30;
        const RANKS = ["小难梁", "牢梁", "梁子", "梁圣", "梁神", "梁祖"];

        /**
         * Portrait anchors on the same 0–30 axis. The nearest *loaded* anchor is
         * shown, so sparse anchors (2, 5, 8, 11, 20, 23, 26 have no frame of their
         * own) still resolve. Files are served by the host half from
         * ./assets/portrait via ctx.webServer.
         */
        const ASSET_PREFIX = `/plugins/${PLUGIN_ID}/assets/portrait/`;
        const PORTRAIT_ANCHORS = [
            { level: 0, file: "stage-00.webp" },
            { level: 1, file: "level-01.webp" },
            { level: 3, file: "level-03.webp" },
            { level: 4, file: "level-04.webp" },
            { level: 6, file: "stage-06.webp" },
            { level: 7, file: "level-07.webp" },
            { level: 9, file: "level-09.webp" },
            { level: 10, file: "level-10.webp" },
            { level: 12, file: "stage-12.webp" },
            { level: 13, file: "level-13.webp" },
            { level: 14, file: "level-14.webp" },
            { level: 15, file: "bridge-15.webp" },
            { level: 16, file: "level-16.webp" },
            { level: 17, file: "level-17.webp" },
            { level: 18, file: "stage-18.webp" },
            { level: 19, file: "level-19.webp" },
            { level: 21, file: "level-21.webp" },
            { level: 22, file: "level-22.webp" },
            { level: 24, file: "stage-24.webp" },
            { level: 25, file: "level-25.webp" },
            { level: 27, file: "bridge-27.webp" },
            { level: 28, file: "level-28.webp" },
            { level: 29, file: "level-29.webp" },
            { level: 30, file: "stage-30.webp" }
        ];

        /**
         * Color stops along the depth axis. `base` is the page canvas, `g1`/`g2`
         * are the two drifting glows, `accent` drives the slider fill, the rank
         * chip and the primary buttons.
         */
        const STOPS = [
            {
                at: 0,
                light: { base: [240, 245, 253], g1: [126, 176, 255], g2: [170, 150, 255], accent: [62, 110, 214] },
                dark: { base: [8, 11, 18], g1: [40, 78, 150], g2: [70, 56, 140], accent: [128, 168, 255] }
            },
            {
                at: 6,
                light: { base: [232, 242, 252], g1: [86, 168, 236], g2: [128, 132, 244], accent: [42, 120, 206] },
                dark: { base: [7, 12, 20], g1: [26, 92, 168], g2: [56, 60, 150], accent: [104, 178, 250] }
            },
            {
                at: 12,
                light: { base: [236, 238, 252], g1: [120, 140, 246], g2: [196, 120, 236], accent: [96, 92, 214] },
                dark: { base: [9, 10, 20], g1: [52, 66, 168], g2: [130, 58, 156], accent: [158, 140, 252] }
            },
            {
                at: 18,
                light: { base: [246, 236, 248], g1: [206, 110, 214], g2: [150, 96, 232], accent: [168, 54, 132] },
                dark: { base: [14, 8, 18], g1: [150, 44, 116], g2: [104, 52, 168], accent: [240, 130, 200] }
            },
            {
                at: 24,
                light: { base: [250, 240, 232], g1: [246, 158, 90], g2: [220, 84, 120], accent: [196, 86, 40] },
                dark: { base: [18, 10, 10], g1: [180, 84, 32], g2: [160, 40, 72], accent: [255, 178, 92] }
            },
            {
                at: 30,
                light: { base: [252, 246, 226], g1: [246, 196, 74], g2: [236, 140, 60], accent: [172, 120, 16] },
                dark: { base: [15, 11, 6], g1: [176, 132, 40], g2: [150, 96, 26], accent: [255, 208, 110] }
            }
        ];

        const css = `
/* ── full-page backdrop ───────────────────────────────────────────────── */
.dsh-lg-backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    background-color: var(--dsh-lg-canvas, transparent);
    transition: opacity 320ms ease;
}
.dsh-lg-backdrop[data-on="1"] { opacity: 1; }
/* Portrait-only mode: keep the native canvas colour and drop the gradient wash. */
.dsh-lg-backdrop[data-plain="1"] .dsh-lg-aurora { display: none; }
/* Safety net: when the theme service is unavailable the alias-token layer cannot
   be applied, so punch the canvas open from CSS instead. With the service
   present the token layer already sets this to transparent (higher precedence). */
html[data-dsh-lianggod-background] body { background: transparent; }
.dsh-lg-aurora {
    position: absolute;
    inset: -12%;
    background-color: var(--dsh-lg-base, transparent);
    background-image:
        radial-gradient(66% 54% at var(--dsh-lg-p1, 18%) var(--dsh-lg-p2, 10%), var(--dsh-lg-g1, transparent) 0%, transparent 62%),
        radial-gradient(64% 60% at var(--dsh-lg-p3, 82%) var(--dsh-lg-p4, 82%), var(--dsh-lg-g2, transparent) 0%, transparent 60%),
        linear-gradient(158deg, var(--dsh-lg-g2, transparent) 0%, transparent 46%);
}
.dsh-lg-aurora::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(118% 96% at 50% 38%, transparent 52%, rgb(0 0 0 / 8%) 100%);
}
/* The character: one cover image per depth anchor, cross-faded on change. It is
   masked on its left edge so it never fights the conversation column, and its
   presence (width + opacity) grows with the depth. */
.dsh-lg-portrait {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--dsh-lg-portrait-width, 44vw);
    max-width: 780px;
    pointer-events: none;
    opacity: var(--dsh-lg-portrait-opacity, 0.5);
    transition: opacity 420ms ease, width 420ms ease;
}
.dsh-lg-portrait img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 30%;
    opacity: 0;
    transition: opacity 240ms ease-out;
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 22%) 14%, #000 38%, #000 100%);
    mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 22%) 14%, #000 38%, #000 100%);
}
.dsh-lg-portrait img[data-active="1"] { opacity: 1; }
/* The frame being replaced keeps fading while the incoming one fades in, so the
   two transitions overlap instead of playing back to back. */
.dsh-lg-portrait img[data-leaving="1"] { transition: opacity 380ms ease-in-out; }
.dsh-lg-portrait[data-on="0"] { display: none; }
.dsh-lg-flare {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(circle at var(--dsh-lg-fx, 50%) var(--dsh-lg-fy, 78%), var(--dsh-lg-flare, transparent) 0%, transparent 56%);
}
.dsh-lg-flare[data-fire="1"] { animation: dsh-lg-flare 720ms ease-out; }
.dsh-lg-mark {
    position: absolute;
    left: clamp(16px, 3vw, 44px);
    bottom: clamp(12px, 2.4vh, 32px);
    color: var(--dsh-lg-accent, currentColor);
    opacity: .1;
    font-family: "Songti SC", "STSong", "Noto Serif SC", serif;
    font-size: clamp(26px, 4vw, 60px);
    font-weight: 700;
    letter-spacing: .12em;
    user-select: none;
    transition: opacity 320ms ease;
}
@keyframes dsh-lg-flare {
    0% { opacity: 0; transform: scale(.86); }
    18% { opacity: .9; }
    100% { opacity: 0; transform: scale(1.1); }
}
@media (prefers-reduced-motion: reduce) {
    .dsh-lg-backdrop, .dsh-lg-mark, .dsh-lg-fill, .dsh-lg-knob, .dsh-lg-rank,
    .dsh-lg-portrait, .dsh-lg-portrait img { transition: none; }
    .dsh-lg-flare[data-fire="1"] { animation: none; }
}

/* ── seat trigger ─────────────────────────────────────────────────────── */
.dsh-lg-root {
    position: relative;
    display: inline-flex;
    min-width: 0;
}
.dsh-lg-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: min(340px, 44cqw);
    height: 28px;
    padding: 0 5px 0 7px;
    border: none;
    border-radius: var(--dsw-radius-sm, 24px);
    background: 0 0;
    color: var(--dsw-alias-label-secondary);
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    cursor: pointer;
    outline: none;
}
.dsh-lg-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-lg-trigger:focus-visible { box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
.dsh-lg-trigger:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.dsh-lg-glyph {
    flex: none;
    width: 14px;
    height: 14px;
    color: var(--dsh-lg-accent, var(--dsw-alias-label-caption));
    transition: color 320ms ease;
}
.dsh-lg-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.dsh-lg-rank {
    flex: none;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--dsh-lg-accent-soft, var(--dsw-alias-interactive-bg-hover));
    color: var(--dsh-lg-accent, var(--dsw-alias-label-secondary));
    font-size: 11px;
    line-height: 16px;
    font-weight: 600;
    transition: background 320ms ease, color 320ms ease;
}
.dsh-lg-chevron { flex: none; color: var(--dsw-alias-label-caption); transition: transform .12s; }
.dsh-lg-chevron[data-open="1"] { transform: rotate(180deg); }

/* ── panel ────────────────────────────────────────────────────────────── */
.dsh-lg-panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    width: min(272px, calc(100vw - 32px));
    max-height: min(440px, calc(100vh - 96px));
    padding: 5px;
    overflow: hidden;
    border: 1px solid var(--dsw-alias-border-inverted);
    border-radius: var(--dsw-radius-lg, 10px);
    background: linear-gradient(var(--dsw-specific-menu), var(--dsw-specific-menu)), var(--dsh-lg-panel, var(--dsw-alias-bg-base, #fff));
    box-shadow: var(--dsw-shadow-lv3);
    color: var(--dsw-alias-label-primary);
    animation: dsh-lg-pop .12s ease-out;
}
@keyframes dsh-lg-pop {
    from { opacity: 0; transform: translateY(6px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}
.dsh-lg-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-radius: var(--dsw-radius-sm, 6px);
    background: 0 0;
    color: inherit;
    font: inherit;
    font-size: 12px;
    line-height: 18px;
    text-align: left;
    cursor: pointer;
}
.dsh-lg-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-lg-rowKey { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-lg-rowValue {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--dsw-alias-label-primary);
    font-weight: 500;
}
.dsh-lg-divider { height: 1px; margin: 5px 0; background: var(--dsw-alias-border-l1); flex: none; }
.dsh-lg-models {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 4px 2px 0;
    max-height: min(216px, 40vh);
    overflow-y: auto;
    border-radius: var(--dsw-radius-sm, 6px);
    scrollbar-width: thin;
}
.dsh-lg-group {
    padding: 6px 8px 2px;
    color: var(--dsw-alias-label-tertiary);
    font-size: 10px;
    line-height: 14px;
}
.dsh-lg-model {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-radius: var(--dsw-radius-sm, 6px);
    background: 0 0;
    color: var(--dsw-alias-label-secondary);
    font: inherit;
    font-size: 12px;
    line-height: 18px;
    text-align: left;
    cursor: pointer;
}
.dsh-lg-model:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-lg-model[data-active="1"] { color: var(--dsw-alias-state-info-primary); }
.dsh-lg-model[data-blocked="1"] { color: var(--dsw-alias-label-tertiary); cursor: not-allowed; }
.dsh-lg-modelName {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.dsh-lg-modelDesc {
    flex-shrink: 1000;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--dsw-alias-label-caption);
    font-size: 11px;
}
.dsh-lg-status, .dsh-lg-empty {
    padding: 8px;
    color: var(--dsw-alias-label-tertiary);
    font-size: 12px;
    line-height: 18px;
}

/* ── rheostat ─────────────────────────────────────────────────────────── */
.dsh-lg-sliderBox {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 8px 6px;
    flex: none;
}
.dsh-lg-sliderHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--dsw-alias-label-secondary);
    font-size: 11px;
    line-height: 16px;
}
.dsh-lg-sliderHead strong {
    color: var(--dsh-lg-accent, var(--dsw-alias-label-primary));
    font-weight: 600;
    transition: color 320ms ease;
}
/* DSH 0.1.2+ paints every border-radius through corner-shape: superellipse(1.5);
   the rail, fill and knob opt back into real round shapes. */
.dsh-lg-rail {
    position: relative;
    height: 30px;
    margin: 10px 0 8px;
}
.dsh-lg-plate {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 15px;
    corner-shape: round;
    background: rgb(0 0 0 / 7%);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 18%), inset 0 -1px 0 rgb(255 255 255 / 28%);
    pointer-events: none;
}
body[data-ds-dark-theme] .dsh-lg-plate {
    background: rgb(255 255 255 / 8%);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 55%), inset 0 -1px 0 rgb(255 255 255 / 6%);
}
.dsh-lg-windings {
    position: absolute;
    inset: 6px 14px;
    border-radius: 9px;
    background-image: repeating-linear-gradient(90deg, rgb(255 255 255 / 20%) 0 1px, transparent 1px 6px);
    opacity: .75;
    pointer-events: none;
}
.dsh-lg-fill {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
    border-radius: 15px;
    corner-shape: round;
    background: linear-gradient(90deg, var(--dsh-lg-fillFrom, #4c8dff), var(--dsh-lg-accent, #7b6cff));
    transition: width .28s cubic-bezier(.2, .9, .25, 1), background 320ms ease;
}
/* While the pointer is down the thumb must track 1:1 — any transition would lag
   behind the cursor and make the stepless drag feel rubbery. The transition is
   back on the moment the pointer lifts, which is what makes the snap visible. */
.dsh-lg-rail[data-dragging="1"] .dsh-lg-fill { transition: background 320ms ease; }
.dsh-lg-rail[data-dragging="1"] .dsh-lg-knob { transition: none; }
.dsh-lg-rail[data-previewing="1"] .dsh-lg-knobCap { box-shadow: 0 2px 10px rgb(0 0 0 / 30%), inset 0 1px 0 #fff, 0 0 0 2px var(--dsh-lg-accent-soft, rgb(0 0 0 / 8%)); }
.dsh-lg-fill::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(255 255 255 / 34%), transparent 46%, rgb(0 0 0 / 16%));
}
.dsh-lg-knob {
    position: absolute;
    z-index: 4;
    top: 50%;
    width: 32px;
    height: 32px;
    margin-left: -16px;
    transform: translateY(-50%);
    transition: left .28s cubic-bezier(.2, .9, .25, 1);
    pointer-events: none;
}
.dsh-lg-knobCap {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    corner-shape: round;
    background: radial-gradient(120% 120% at 32% 26%, #fff, #e9ecf3 46%, #c6cad6 100%);
    box-shadow: 0 2px 6px rgb(0 0 0 / 26%), inset 0 1px 0 #fff;
}
.dsh-lg-knobCap::after {
    content: "";
    position: absolute;
    inset: 41% 24%;
    border-radius: 50%;
    corner-shape: round;
    background: var(--dsh-lg-accent, #4c8dff);
    box-shadow: 0 0 6px var(--dsh-lg-accent, #4c8dff);
    transition: background 320ms ease;
}
.dsh-lg-ticks {
    position: absolute;
    z-index: 2;
    top: 0;
    right: 17px;
    bottom: 0;
    left: 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: none;
}
.dsh-lg-tick {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    corner-shape: round;
    background: rgb(0 0 0 / 22%);
}
.dsh-lg-tick[data-on="1"] { background: rgb(255 255 255 / 76%); }
/* The depth the session is actually committed to, marked so a previewing thumb
   never hides where it will land. */
.dsh-lg-tick[data-current="1"] {
    width: 6px;
    height: 6px;
    background: rgb(255 255 255 / 96%);
    box-shadow: 0 0 0 2px rgb(255 255 255 / 32%);
}
body[data-ds-dark-theme] .dsh-lg-tick { background: rgb(255 255 255 / 26%); }
body[data-ds-dark-theme] .dsh-lg-tick[data-on="1"] { background: rgb(255 255 255 / 84%); }
body[data-ds-dark-theme] .dsh-lg-tick[data-current="1"] { background: rgb(255 255 255 / 98%); }
.dsh-lg-input {
    position: absolute;
    z-index: 3;
    top: 50%;
    left: 0;
    width: 100%;
    height: 40px;
    margin: 0;
    transform: translateY(-50%);
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    outline: none;
    color: transparent;
}
.dsh-lg-input:disabled { opacity: .55; cursor: wait; }
.dsh-lg-input::-webkit-slider-runnable-track {
    height: 30px;
    border: none;
    border-radius: 15px;
    background: transparent;
}
.dsh-lg-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    margin-top: -1px;
    border: none;
    border-radius: 50%;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
}
.dsh-lg-input::-moz-range-track {
    height: 30px;
    border: none;
    border-radius: 15px;
    background: transparent;
}
.dsh-lg-input::-moz-range-thumb {
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
}
.dsh-lg-desc {
    margin: 2px 0 0;
    color: var(--dsw-alias-label-caption);
    font-size: 11px;
    line-height: 15px;
}
.dsh-lg-error {
    margin: 2px 0 0;
    padding: 4px 6px;
    border-radius: var(--dsw-radius-sm, 6px);
    background: var(--dsw-alias-interactive-bg-hover-danger);
    color: var(--dsw-alias-state-error-primary);
    font-size: 11px;
    line-height: 15px;
}

/* ── switches (settings card) ─────────────────────────────────────────── */
.dsh-lg-switch {
    position: relative;
    flex: none;
    width: 29px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--dsw-alias-interactive-bg-hover);
    cursor: pointer;
    transition: background 160ms ease;
}
.dsh-lg-switch[data-on="1"] { background: var(--dsh-lg-accent, var(--dsw-alias-button-primary-fill)); }
.dsh-lg-switchKnob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    corner-shape: round;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
    transition: transform 160ms ease;
}
.dsh-lg-switch[data-on="1"] .dsh-lg-switchKnob { transform: translateX(13px); }
.dsh-lg-switch:disabled { opacity: .45; cursor: default; }

/* ── settings card (设置 → 插件 → 插件配置) ───────────────────────────── */
.dsh-lg-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 14px 16px;
    border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-primary);
    list-style: none;
}
.dsh-lg-cardHead {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.dsh-lg-cardTitle {
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
}
.dsh-lg-cardDesc {
    color: var(--dsw-alias-label-tertiary);
    font-size: 12px;
    line-height: 18px;
}
.dsh-lg-cardRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-lg-cardRowText {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.dsh-lg-cardRowLabel {
    font-size: 13px;
    line-height: 20px;
}
.dsh-lg-cardRowHint {
    color: var(--dsw-alias-label-caption);
    font-size: 11px;
    line-height: 16px;
}
.dsh-lg-cardNote {
    color: var(--dsw-alias-label-caption);
    font-size: 11px;
    line-height: 16px;
}
`;

        // Styles are injected at module load, like the shipped client bundles do:
        // the client sandbox does not guarantee effect callbacks run before first paint.
        const STYLE_TAG_ID = PLUGIN_ID + "/seat.css";
        if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) === null) {
            const tag = document.createElement("style");
            tag.dataset.plugin = PLUGIN_ID;
            tag.dataset.pluginCss = STYLE_TAG_ID;
            tag.textContent = css;
            document.head.appendChild(tag);
        }

        //#region color math
        const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
        const clamp01 = (value) => clamp(value, 0, 1);
        const mix = (from, to, amount) => [
            from[0] + (to[0] - from[0]) * amount,
            from[1] + (to[1] - from[1]) * amount,
            from[2] + (to[2] - from[2]) * amount
        ];
        const rgb = (color) => `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])})`;
        const rgba = (color, alpha) => (
            `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])} / ${Math.round(alpha * 1000) / 1000})`
        );

        const LIGHT_INK = [255, 255, 255];
        const DARK_INK = [11, 13, 19];

        function rankAt(level) {
            const span = LEVEL_MAX / RANKS.length;
            const index = level >= LEVEL_MAX ? RANKS.length - 1 : Math.floor(level / span);
            return RANKS[clamp(index, 0, RANKS.length - 1)];
        }

        /** Resolve the continuous depth position (0..1) into a full palette. */
        function paletteAt(position) {
            const level = clamp01(position) * LEVEL_MAX;
            let index = 0;
            while (index < STOPS.length - 2 && STOPS[index + 1].at <= level) index += 1;
            const from = STOPS[index];
            const to = STOPS[index + 1];
            const span = to.at - from.at;
            const amount = span <= 0 ? 0 : clamp01((level - from.at) / span);
            const pick = (scheme) => ({
                base: mix(from[scheme].base, to[scheme].base, amount),
                g1: mix(from[scheme].g1, to[scheme].g1, amount),
                g2: mix(from[scheme].g2, to[scheme].g2, amount),
                accent: mix(from[scheme].accent, to[scheme].accent, amount)
            });
            return {
                level,
                strength: level / LEVEL_MAX,
                rank: rankAt(level),
                light: pick("light"),
                dark: pick("dark")
            };
        }
        //#endregion

        //#region presenter
        /** Every custom property this module writes onto <body>. */
        const BODY_VARS = [
            "--dsh-lg-base", "--dsh-lg-g1", "--dsh-lg-g2",
            "--dsh-lg-p1", "--dsh-lg-p2", "--dsh-lg-p3", "--dsh-lg-p4",
            "--dsh-lg-accent", "--dsh-lg-accent-soft", "--dsh-lg-fillFrom",
            "--dsh-lg-flare", "--dsh-lg-fx", "--dsh-lg-fy", "--dsh-lg-panel",
            "--dsh-lg-portrait-opacity", "--dsh-lg-portrait-width", "--dsh-lg-canvas"
        ];

        const HTML_FLAG = "dshLianggodBackground";

        /**
         * Alias-token layer for one palette. Values are `{ light, dark }` pairs
         * because `theme.overrideTokens` composes one value per color scheme.
         */
        function buildTokens(palette) {
            const scheme = (name) => {
                const color = palette[name];
                const dark = name === "dark";
                const ink = dark ? DARK_INK : LIGHT_INK;
                const wash = (tint, alpha) => rgba(mix(ink, color.g1, tint), alpha);
                return {
                    "--dsw-alias-bg-base": "transparent",
                    "--dsw-alias-bg-layer-1": wash(0.16, dark ? 0.62 : 0.66),
                    "--dsw-alias-bg-layer-2": wash(0.11, dark ? 0.74 : 0.78),
                    "--dsw-alias-bg-layer-3": wash(0.07, dark ? 0.86 : 0.9),
                    "--dsw-specific-sidebar-fill": wash(0.14, dark ? 0.5 : 0.54),
                    "--dsw-specific-input-major": wash(0.1, dark ? 0.86 : 0.9),
                    "--dsw-specific-bubble": wash(0.12, dark ? 0.82 : 0.86),
                    "--dsw-specific-menu": rgba(mix(ink, color.g1, 0.08), dark ? 0.96 : 0.98),
                    "--dsw-alias-brand-primary": rgb(color.accent),
                    "--dsw-alias-button-primary-fill": rgb(color.accent),
                    "--dsw-alias-button-primary-hover": rgb(mix(color.accent, ink, 0.16)),
                    "--dsw-alias-state-business-primary": rgb(color.accent)
                };
            };
            const light = scheme("light");
            const dark = scheme("dark");
            const tokens = {};
            for (const key of Object.keys(light)) tokens[key] = { light: light[key], dark: dark[key] };
            return tokens;
        }

        /**
         * Owns the DOM side of the appearance: one fixed layer under the app, the
         * body custom properties the palettes flow through, and the alias-token
         * override layer. Colour and portrait are independent modes, each owned by
         * one switch in the settings card. Every entry point is idempotent and
         * reversible.
         */
        function createPresenter(theme) {
            let backdrop = null;
            let aurora = null;
            let flare = null;
            let mark = null;
            let tokenDisposer = null;
            let modes = { ...DEFAULT_MODES };
            let idle = false;
            let position = 0;
            let frame = 0;
            let pending = null;
            let disposed = false;

            // Portrait state: one record per anchor (load status survives a
            // disable/re-enable cycle because the browser cache backs it), plus the
            // two <img> frames that cross-fade.
            const portraits = PORTRAIT_ANCHORS.map((anchor) => ({
                level: anchor.level,
                base: `${ASSET_PREFIX}${anchor.file}`,
                status: "idle",
                retries: 0
            }));
            let portrait = null;
            let frames = [];
            let activeFrame = 0;
            let activePortrait = -1;
            let switchToken = 0;

            // Transient mode state: with `persistent` off the appearance is only on
            // while the rheostat is being dragged plus a short linger after the snap.
            let revealed = false;
            let draggingNow = false;
            let lingerTimer = 0;
            let fadeTimer = 0;

            const doc = () => (typeof document === "undefined" ? null : document);

            /** Timers belong to the page, so they die with it and are cancellable here. */
            function schedule(callback, delay) {
                const view = doc()?.defaultView;
                if (view !== null && view !== undefined && typeof view.setTimeout === "function") return view.setTimeout(callback, delay);
                return typeof setTimeout === "function" ? setTimeout(callback, delay) : 0;
            }

            function cancelTimer(id) {
                if (id === 0 || id === undefined || id === null) return;
                const view = doc()?.defaultView;
                if (view !== null && view !== undefined && typeof view.clearTimeout === "function") view.clearTimeout(id);
                else if (typeof clearTimeout === "function") clearTimeout(id);
            }

            function scheme() {
                if (theme !== null && typeof theme.getTheme === "function") {
                    try {
                        const snapshot = theme.getTheme();
                        const value = snapshot?.active?.colorScheme;
                        if (value === "dark" || value === "light") return value;
                    } catch {
                        // fall through to the DOM heuristic
                    }
                }
                const body = doc()?.body;
                return body !== null && body !== undefined && body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
            }

            /** True while at least one appearance mode is enabled at all. */
            function appearanceOn() {
                return modes.background === true || modes.portrait === true;
            }

            /**
             * True while the backdrop should be mounted: on by mode, not idled out by
             * a model without reasoning choices, and — in transient mode — only after
             * a drag revealed it.
             */
            function live() {
                if (!appearanceOn() || idle) return false;
                if (modes.persistent === true) return true;
                return revealed;
            }

            /** Pristine page canvas colour, before this module overrides the token. */
            function canvasColor(mode) {
                if (theme !== null && typeof theme.getTheme === "function") {
                    try {
                        const snapshot = theme.getTheme();
                        const definition = snapshot?.themes?.find?.((entry) => entry?.id === snapshot?.active?.id);
                        const value = definition?.tokens?.["--dsw-alias-bg-base"];
                        if (typeof value === "string" && value.length > 0) return value;
                    } catch {
                        // fall through to the fixed neutrals
                    }
                }
                return mode === "dark" ? "#101318" : "#f7f8fa";
            }

            // ── portrait ────────────────────────────────────────────────────
            /** Start fetching every anchor once; failures retry with a cache-buster. */
            function preloadPortraits() {
                const current = doc();
                if (current === null) return;
                for (const record of portraits) {
                    if (record.status !== "idle") continue;
                    record.status = "loading";
                    loadPortrait(record, current);
                }
            }

            function loadPortrait(record, current) {
                const probe = current.createElement("img");
                probe.decoding = "async";
                probe.onload = () => {
                    record.status = "ready";
                    if (backdrop !== null && live()) applyPortrait(position * LEVEL_MAX);
                };
                probe.onerror = () => {
                    if (record.retries >= 3) {
                        record.status = "failed";
                        return;
                    }
                    record.retries += 1;
                    probe.src = `${record.base}?retry=${record.retries}`;
                };
                probe.src = record.base;
            }

            /** Nearest anchor that actually decoded; ties fall to the higher level. */
            function nearestPortrait(level) {
                let best = -1;
                let bestDelta = Number.POSITIVE_INFINITY;
                for (let index = 0; index < portraits.length; index += 1) {
                    const record = portraits[index];
                    if (record.status !== "ready") continue;
                    const delta = Math.abs(record.level - level);
                    if (delta < bestDelta || (delta === bestDelta && record.level > level)) {
                        best = index;
                        bestDelta = delta;
                    }
                }
                return best;
            }

            /**
             * Cross-fade to the nearest loaded anchor.
             *
             * The two frames move in the SAME tick and the outgoing one is given a
             * longer fade, so the incoming image is already fully composited before
             * the outgoing finishes: the two transitions overlap instead of playing
             * one after the other (fade the old one out, then fade the new one in),
             * which reads as a dip to the page background. `decode()` guarantees the
             * incoming frame has pixels before its opacity starts moving.
             */
            function applyPortrait(level) {
                if (portrait === null || frames.length !== 2) return;
                const index = nearestPortrait(level);
                if (index < 0 || index === activePortrait) return;
                const record = portraits[index];
                const token = ++switchToken;
                const incoming = frames[1 - activeFrame];
                const outgoing = frames[activeFrame];

                const commit = () => {
                    if (token !== switchToken) return;
                    // Same tick, both frames: outgoing fades out (longer, see CSS),
                    // incoming fades in on top of it.
                    outgoing.dataset.leaving = "1";
                    outgoing.dataset.active = "0";
                    incoming.dataset.active = "1";
                    activeFrame = 1 - activeFrame;
                    activePortrait = index;
                };

                const fail = () => {
                    if (token !== switchToken) return;
                    record.status = "failed";
                    // Fall back to the next nearest anchor that did load.
                    applyPortrait(level);
                };

                delete incoming.dataset.leaving;
                incoming.alt = "";
                incoming.draggable = false;

                if (incoming.getAttribute("src") === record.base) {
                    // The pixels are already in this frame; flip immediately.
                    commit();
                    return;
                }
                incoming.onload = () => {
                    if (token !== switchToken) return;
                    if (typeof incoming.decode === "function") {
                        incoming.decode().then(commit, commit);
                        return;
                    }
                    commit();
                };
                incoming.onerror = fail;
                incoming.src = record.base;
            }

            function mount() {
                const current = doc();
                if (current === null || disposed) return;
                if (backdrop !== null && backdrop.isConnected) return;
                backdrop = current.createElement("div");
                backdrop.className = "dsh-lg-backdrop";
                backdrop.dataset.plugin = PLUGIN_ID;
                backdrop.setAttribute("aria-hidden", "true");
                aurora = current.createElement("div");
                aurora.className = "dsh-lg-aurora";
                flare = current.createElement("div");
                flare.className = "dsh-lg-flare";
                mark = current.createElement("div");
                mark.className = "dsh-lg-mark";
                portrait = current.createElement("div");
                portrait.className = "dsh-lg-portrait";
                portrait.setAttribute("aria-hidden", "true");
                frames = [current.createElement("img"), current.createElement("img")];
                for (const image of frames) {
                    image.alt = "";
                    image.draggable = false;
                    image.dataset.active = "0";
                }
                portrait.append(...frames);
                backdrop.append(aurora, portrait, flare, mark);
                current.body.prepend(backdrop);
                current.documentElement.dataset[HTML_FLAG] = "on";
                preloadPortraits();
            }

            function unmount() {
                const current = doc();
                if (backdrop !== null) backdrop.remove();
                backdrop = null;
                aurora = null;
                flare = null;
                mark = null;
                portrait = null;
                frames = [];
                activeFrame = 0;
                activePortrait = -1;
                switchToken += 1;
                if (current !== null) {
                    delete current.documentElement.dataset[HTML_FLAG];
                    for (const name of BODY_VARS) current.body.style.removeProperty(name);
                }
            }

            function paint(value) {
                const current = doc();
                if (current === null) return;
                const palette = paletteAt(value);
                const mode = scheme();
                const color = palette[mode];
                const strength = palette.strength;
                const dark = mode === "dark";
                const style = current.body.style;
                style.setProperty("--dsh-lg-base", rgba(color.base, dark ? 0.98 : 1));
                style.setProperty("--dsh-lg-g1", rgba(color.g1, (dark ? 0.5 : 0.34) + 0.22 * strength));
                style.setProperty("--dsh-lg-g2", rgba(color.g2, (dark ? 0.44 : 0.28) + 0.26 * strength));
                style.setProperty("--dsh-lg-p1", `${(16 + 14 * strength).toFixed(1)}%`);
                style.setProperty("--dsh-lg-p2", `${(10 - 6 * strength).toFixed(1)}%`);
                style.setProperty("--dsh-lg-p3", `${(84 - 18 * strength).toFixed(1)}%`);
                style.setProperty("--dsh-lg-p4", `${(80 + 12 * strength).toFixed(1)}%`);
                style.setProperty("--dsh-lg-accent", rgb(color.accent));
                style.setProperty("--dsh-lg-accent-soft", rgba(color.accent, dark ? 0.26 : 0.15));
                style.setProperty("--dsh-lg-fillFrom", rgb(mix(color.g1, color.accent, 0.55)));
                style.setProperty("--dsh-lg-flare", rgba(color.accent, 0.3));
                style.setProperty("--dsh-lg-panel", rgb(mix(color.base, dark ? [18, 20, 26] : LIGHT_INK, 0.32)));
                style.setProperty("--dsh-lg-portrait-opacity", String(
                    Math.round(((dark ? 0.5 : 0.4) + (dark ? 0.26 : 0.24) * strength) * 1000) / 1000
                ));
                style.setProperty("--dsh-lg-portrait-width", `${(42 + 12 * strength).toFixed(1)}vw`);
                style.setProperty("--dsh-lg-canvas", canvasColor(mode));
                if (mark !== null) mark.textContent = palette.rank;
                applyPortrait(palette.level);
            }

            /**
             * Token layer for the active modes. Colour mode recolours the whole
             * surface set; portrait-only mode touches nothing but the canvas so the
             * rest of the UI keeps the user's theme.
             */
            function applyTokens(value) {
                if (theme === null || typeof theme.overrideTokens !== "function") return;
                const tokens = modes.background === true
                    ? buildTokens(paletteAt(value))
                    : {
                        "--dsw-alias-bg-base": { light: "transparent", dark: "transparent" }
                    };
                try {
                    tokenDisposer = theme.overrideTokens(PLUGIN_ID, tokens) ?? null;
                } catch {
                    tokenDisposer = null;
                }
            }

            function clearTokens() {
                if (tokenDisposer === null) return;
                try {
                    tokenDisposer();
                } catch {
                    // a superseded layer is already gone
                }
                tokenDisposer = null;
            }

            function sync() {
                const current = doc();
                if (current === null) return;
                if (!live()) {
                    unmount();
                    clearTokens();
                    return;
                }
                mount();
                paint(position);
                applyTokens(position);
                if (backdrop !== null) {
                    backdrop.dataset.on = "1";
                    backdrop.dataset.plain = modes.background === true ? "0" : "1";
                }
                if (portrait !== null) portrait.dataset.on = modes.portrait === true ? "1" : "0";
            }

            function fire() {
                if (flare === null) return;
                flare.dataset.fire = "0";
                // Force a reflow so the animation restarts on a repeated commit.
                void flare.offsetWidth;
                flare.dataset.fire = "1";
            }

            // ── transient visibility (persistent: false) ─────────────────────
            /** Show the appearance and cancel any pending linger/fade. */
            function reveal() {
                if (disposed) return;
                cancelTimer(lingerTimer);
                cancelTimer(fadeTimer);
                lingerTimer = 0;
                fadeTimer = 0;
                const was = revealed;
                revealed = true;
                if (!was) sync();
                else if (backdrop !== null) backdrop.dataset.on = "1";
            }

            /**
             * Start the linger after the pointer lifts (or after a programmatic
             * level change): stay visible for REVEAL_LINGER_MS, then fade out and
             * hand the page back to the native appearance.
             */
            function scheduleHide() {
                if (disposed || modes.persistent === true || draggingNow || !revealed) return;
                cancelTimer(lingerTimer);
                lingerTimer = schedule(() => {
                    lingerTimer = 0;
                    if (disposed || modes.persistent === true || draggingNow || !revealed) return;
                    revealed = false;
                    if (backdrop !== null) backdrop.dataset.on = "0";
                    cancelTimer(fadeTimer);
                    fadeTimer = schedule(() => {
                        fadeTimer = 0;
                        if (disposed || live()) return;
                        unmount();
                        clearTokens();
                    }, FADE_OUT_MS);
                }, REVEAL_LINGER_MS);
            }

            return {
                /** Visual-only update used while the thumb is being dragged. */
                preview(value) {
                    position = clamp01(value);
                    if (disposed) return;
                    if (!live()) {
                        // A drag (or a keyboard hop) is the one thing allowed to bring
                        // the appearance back in transient mode.
                        if (!draggingNow) return;
                        reveal();
                        if (!live()) return;
                    }
                    pending = position;
                    if (frame !== 0) return;
                    const view = doc()?.defaultView;
                    const animate = view !== undefined && view !== null && typeof view.requestAnimationFrame === "function"
                        ? view.requestAnimationFrame.bind(view)
                        : (callback) => view !== undefined && view !== null && typeof view.setTimeout === "function" ? view.setTimeout(callback, 16) : callback;
                    frame = animate(() => {
                        frame = 0;
                        if (!live() || disposed) return;
                        paint(pending);
                    });
                },
                /** Pointer/keyboard drag state: transient mode reveals and lingers. */
                setDragging(next) {
                    if (disposed) return;
                    draggingNow = next === true;
                    if (draggingNow) {
                        reveal();
                        return;
                    }
                    scheduleHide();
                },
                /** Committed level: repaint, re-tint the alias tokens, flare once. */
                setLevel(value, animate) {
                    position = clamp01(value);
                    if (disposed) return;
                    if (live()) {
                        sync();
                        if (animate === true && modes.background === true) fire();
                        scheduleHide();
                    }
                },
                /** Flare origin in viewport percentages, taken from the thumb. */
                setOrigin(x, y) {
                    const current = doc();
                    if (current === null) return;
                    if (Number.isFinite(x)) current.body.style.setProperty("--dsh-lg-fx", `${x.toFixed(2)}%`);
                    if (Number.isFinite(y)) current.body.style.setProperty("--dsh-lg-fy", `${y.toFixed(2)}%`);
                },
                /** Appearance switches; the three modes are independent. */
                setModes(next) {
                    const wasPersistent = modes.persistent === true;
                    modes = {
                        background: next?.background !== false,
                        portrait: next?.portrait !== false,
                        persistent: next?.persistent !== false
                    };
                    if (disposed) return;
                    if (modes.persistent === true) {
                        // Persistent mode is always on: clear any pending linger/fade
                        // and re-apply (the other two switches may have changed too).
                        cancelTimer(lingerTimer);
                        cancelTimer(fadeTimer);
                        lingerTimer = 0;
                        fadeTimer = 0;
                        revealed = true;
                        sync();
                        return;
                    }
                    if (!wasPersistent) {
                        sync();
                        return;
                    }
                    // Persistent was just switched off: hand the page back at once
                    // unless a drag is in flight.
                    if (draggingNow) return;
                    revealed = false;
                    sync();
                },
                setIdle(next) {
                    idle = next === true;
                    if (disposed) return;
                    sync();
                },
                getModes() {
                    return { ...modes };
                },
                dispose() {
                    disposed = true;
                    cancelTimer(lingerTimer);
                    cancelTimer(fadeTimer);
                    lingerTimer = 0;
                    fadeTimer = 0;
                    const current = doc();
                    if (frame !== 0 && current !== null) {
                        const view = current.defaultView;
                        if (view !== null && typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(frame);
                        frame = 0;
                    }
                    clearTokens();
                    unmount();
                }
            };
        }
        //#endregion

        //#region helpers
        const COMMIT_KEYS = new Set([
            "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
            "Home", "End", "PageUp", "PageDown"
        ]);

        /** Arrow keys hop one depth level instead of one raw slider step. */
        const ARROW_DIRECTION = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };

        /**
         * The thumb is stepless: the input's value is a fine integer over this
         * range, so dragging walks the palette and the portrait anchors
         * continuously. Only the release snaps onto an available depth.
         */
        const SLIDER_STEPS = 1000;

        const stepForPosition = (position) => Math.round(clamp01(position) * SLIDER_STEPS);
        const positionForStep = (step) => clamp01(Number(step) / SLIDER_STEPS);
        const nearestIndexFor = (position, maxIndex) => (
            maxIndex <= 0 ? 0 : clamp(Math.round(clamp01(position) * maxIndex), 0, maxIndex)
        );

        /** Transient mode: how long the appearance lingers after the snap. */
        const REVEAL_LINGER_MS = 750;
        /** Matches the backdrop's own opacity transition so the fade completes. */
        const FADE_OUT_MS = 320;

        // Same glyph geometry as the host's 14px chevrons.
        const ICON_CHEVRON_DOWN = "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z";
        // A resistor-in-a-box glyph used as the trigger mark.
        const ICON_RHEOSTAT = "M1.75 4.25h1.1a1.05 1.05 0 0 1 1.95 0h1.6a1.05 1.05 0 0 1 1.95 0h1.55a1.05 1.05 0 0 1 1.95 0h1.1v5.5h-1.1a1.05 1.05 0 0 1-1.95 0h-1.55a1.05 1.05 0 0 1-1.95 0h-1.6a1.05 1.05 0 0 1-1.95 0h-1.1v-5.5Z";

        const chevronIcon = (className, open) => react.createElement(
            "svg",
            {
                className,
                "data-open": open ? "1" : "0",
                width: 14,
                height: 14,
                viewBox: "0 0 14 14",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                "aria-hidden": "true"
            },
            react.createElement("path", { d: ICON_CHEVRON_DOWN, fill: "currentColor" })
        );

        const rheostatIcon = () => react.createElement(
            "svg",
            {
                className: "dsh-lg-glyph",
                width: 14,
                height: 14,
                viewBox: "0 0 14 14",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                "aria-hidden": "true"
            },
            react.createElement("path", { d: ICON_RHEOSTAT, fill: "currentColor", opacity: 0.85 })
        );

        function effortIndex(levels, current) {
            const index = levels.findIndex((level) => level.id === current);
            return index >= 0 ? index : Math.floor((levels.length - 1) / 2);
        }

        function modelKey(provider, model) {
            return `${provider}/${model}`;
        }

        function explainError(message) {
            if (typeof message !== "string" || message.length === 0) return "推理深度切换失败";
            if (message.includes("does not support reasoning effort")) return "此模型不支持当前推理深度";
            if (message.includes("does not accept image input") || message.includes("already contains images")) {
                return "当前草稿包含图片，此模型不支持图片输入";
            }
            return message;
        }

        function defaultUseInput(select) {
            return select({ draft: "", imageIds: [], draftRev: 0, phase: "plain", occurrences: [], queue: [] });
        }
        //#endregion

        //#region seat component
        function LianggodSeat(props) {
            const { locked, available, directory, load, select, presenter } = props;
            const state = react.useSyncExternalStore(
                (listener) => directory.subscribe(listener),
                () => directory.getSnapshot()
            );

            const [open, setOpen] = react.useState(false);
            const [modelsOpen, setModelsOpen] = react.useState(false);
            const [initialLoading, setInitialLoading] = react.useState(true);
            const [blockedModels, setBlockedModels] = react.useState({});
            // Stepless thumb position (0..SLIDER_STEPS) while the pointer is down; -1
            // means "not dragging", i.e. the thumb renders the settled depth.
            const [dragStep, setDragStep] = react.useState(-1);
            const [dragging, setDragging] = react.useState(false);
            const [pendingIndex, setPendingIndex] = react.useState(-1);
            const [queued, setQueued] = react.useState(null);
            const [sliderError, setSliderError] = react.useState(null);
            const rootRef = react.useRef(null);
            const panelRef = react.useRef(null);
            const liveKeyRef = react.useRef(null);
            const stepRef = react.useRef(-1);
            /**
             * Drag state lives in both places on purpose: the ref drives the rail's
             * own styling, the presenter drives the transient reveal/linger timers of
             * the non-persistent mode.
             */
            const markDragging = (value) => {
                setDragging(value);
                presenter.setDragging(value);
            };
            const inputSnapshot = (props.useInput ?? defaultUseInput)((snapshot) => snapshot);
            const draftHasImages = inputSnapshot !== null && inputSnapshot !== undefined && (inputSnapshot.imageIds?.length ?? 0) > 0;

            react.useEffect(() => {
                if (available) load().then(() => setInitialLoading(false), () => setInitialLoading(false));
            }, [available, load]);

            react.useEffect(() => {
                if (!open) {
                    setModelsOpen(false);
                }
            }, [open]);

            react.useEffect(() => {
                if (!open) return;
                const closeOutside = (event) => {
                    if (!rootRef.current?.contains(event.target)) setOpen(false);
                };
                document.addEventListener("mousedown", closeOutside);
                return () => document.removeEventListener("mousedown", closeOutside);
            }, [open]);

            const currentChoice = react.useMemo(() => {
                if (state.current === null || state.current === undefined) return undefined;
                for (const group of state.groups) {
                    if (group.id !== state.current.provider) continue;
                    const model = group.models.find((candidate) => candidate.id === state.current.model);
                    if (model !== undefined) return { group, model };
                }
                return undefined;
            }, [state.current?.provider, state.current?.model, state.groups]);

            const busy = state.status === "selecting" || state.status === "loading";
            const currentEffort = state.current?.reasoningEffort ?? currentChoice?.model.reasoning?.defaultEffort;
            const levels = currentChoice?.model.reasoning?.efforts ?? [];
            const currentIndex = currentChoice === undefined ? -1 : effortIndex(levels, currentEffort);
            const maxIndex = levels.length - 1;
            const currentKey = state.current === null || state.current === undefined
                ? null
                : modelKey(state.current.provider, state.current.model);
            liveKeyRef.current = currentKey;
            const positionOf = (index) => (maxIndex <= 0 ? 0 : clamp01(index / maxIndex));
            const nearestIndexForPosition = (position) => nearestIndexFor(position, maxIndex);
            const currentLevel = levels[currentIndex];
            const modelLabel = currentChoice === undefined ? "选择模型" : currentChoice.model.name;
            const rankLabel = levels.length > 1 ? rankAt(positionOf(currentIndex) * LEVEL_MAX) : undefined;
            const summary = currentLevel === undefined
                ? modelLabel
                : `${modelLabel} · ${currentLevel.name ?? currentEffort ?? ""}`;

            // Keep the backdrop in step with the committed depth, and stand down on
            // models that expose no choice at all.
            react.useEffect(() => {
                if (!available || levels.length < 2) {
                    presenter.setIdle(true);
                    return;
                }
                presenter.setIdle(false);
                presenter.setLevel(positionOf(currentIndex), true);
            }, [available, currentIndex, levels.length, presenter]);

            react.useEffect(() => {
                stepRef.current = -1;
                setDragStep(-1);
                markDragging(false);
                setPendingIndex(-1);
                setQueued(null);
                setSliderError(null);
            }, [state.current?.provider, state.current?.model]);

            const throttleOrigin = (input, step) => {
                if (input === null || input === undefined) return;
                const box = input.getBoundingClientRect();
                const view = window;
                if (box.width <= 0 || box.height <= 0) return;
                const ratio = positionForStep(step ?? input.value);
                const x = ((box.left + box.width * ratio) / view.innerWidth) * 100;
                const y = ((box.top + box.height / 2) / view.innerHeight) * 100;
                presenter.setOrigin(x, y);
            };

            const submitEffort = (nextIndex) => {
                const nextEffort = levels[nextIndex]?.id;
                if (nextEffort === undefined || currentKey === null || nextEffort === currentEffort) {
                    setPendingIndex(-1);
                    return;
                }
                const submittedKey = currentKey;
                setSliderError(null);
                setPendingIndex(nextIndex);
                select({
                    provider: state.current.provider,
                    model: state.current.model,
                    reasoningEffort: nextEffort
                }).then((accepted) => {
                    if (accepted || liveKeyRef.current !== submittedKey) return;
                    setPendingIndex(-1);
                    setSliderError(explainError(directory.getSnapshot().error));
                    presenter.setLevel(positionOf(currentIndex), false);
                });
            };

            react.useEffect(() => {
                if (pendingIndex < 0) return;
                if (currentIndex === pendingIndex) {
                    setPendingIndex(-1);
                }
            }, [currentIndex, pendingIndex]);

            react.useEffect(() => {
                if (busy || queued === null) return;
                setQueued(null);
                if (queued.key !== currentKey) return;
                submitEffort(queued.index);
            }, [busy, queued]);

            // Keep every hook above this line: bailing out earlier changes the hook count.
            if (!available) return null;

            const chooseModel = (group, model) => {
                const key = modelKey(group.id, model.id);
                if (blockedModels[key] !== undefined) return;
                if (state.current?.provider === group.id && state.current?.model === model.id) {
                    setModelsOpen(false);
                    return;
                }
                const selection = {
                    provider: group.id,
                    model: model.id,
                    ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort })
                };
                select(selection).then((accepted) => {
                    if (!accepted) {
                        setBlockedModels((current) => ({
                            ...current,
                            [key]: explainError(directory.getSnapshot().error)
                        }));
                        return;
                    }
                    stepRef.current = -1;
                    setDragStep(-1);
                    markDragging(false);
                    setPendingIndex(-1);
                    setModelsOpen(false);
                });
            };

            const onSlide = (event) => {
                const step = Number(event.currentTarget.value);
                if (!Number.isFinite(step)) return;
                stepRef.current = step;
                if (!dragging) markDragging(true);
                setDragStep(step);
                // Continuous preview: the backdrop and the portrait follow the thumb
                // 1:1, so the whole ladder of backgrounds plays while dragging.
                presenter.preview(positionForStep(step));
                throttleOrigin(event.currentTarget, step);
            };

            const settle = (step) => {
                const nextIndex = nearestIndexForPosition(positionForStep(step));
                stepRef.current = step;
                markDragging(false);
                // Dropping the draft lets the thumb spring to the settled depth; the
                // rail's CSS transition turns that into a visible magnetic snap.
                setDragStep(-1);
                // Always land the backdrop on the snapped depth, even when the model
                // write is skipped (same level) or has to wait for the store.
                presenter.setLevel(positionOf(nextIndex), false);
                if (busy) {
                    setQueued({ index: nextIndex, key: currentKey });
                    return;
                }
                submitEffort(nextIndex);
            };

            const commitEffort = (event) => {
                const raw = Number(event?.currentTarget?.value);
                const step = Number.isFinite(raw) ? raw : stepRef.current;
                if (!Number.isFinite(step)) return;
                throttleOrigin(event?.currentTarget ?? null, step);
                settle(step);
            };

            const onSliderKeyUp = (event) => {
                if (COMMIT_KEYS.has(event.key)) settle(stepRef.current);
            };

            const onSliderKeyDown = (event) => {
                if (event.key === "Escape") {
                    stepRef.current = stepForPosition(positionOf(Math.max(currentIndex, 0)));
                    setDragStep(-1);
                    markDragging(false);
                    presenter.preview(positionOf(Math.max(currentIndex, 0)));
                    return;
                }
                // Arrows hop one available depth at a time (the raw step is 1/1000 of
                // the track, which would be useless from the keyboard).
                const direction = ARROW_DIRECTION[String(event.key)];
                if (direction !== undefined) {
                    event.preventDefault();
                    const base = nearestIndexForPosition(positionForStep(stepRef.current));
                    const next = clamp(base + direction, 0, Math.max(maxIndex, 0));
                    const step = stepForPosition(positionOf(next));
                    stepRef.current = step;
                    markDragging(true);
                    setDragStep(step);
                    presenter.preview(positionForStep(step));
                    return;
                }
                if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const step = event.key === "Home" ? 0 : SLIDER_STEPS;
                    stepRef.current = step;
                    markDragging(true);
                    setDragStep(step);
                    presenter.preview(positionForStep(step));
                }
            };

            const committedT = positionOf(Math.max(currentIndex, 0));
            const settledStep = stepForPosition(pendingIndex >= 0 ? positionOf(pendingIndex) : committedT);
            const displayStep = dragStep >= 0 ? dragStep : settledStep;
            const displayT = positionForStep(displayStep);
            const displayedIndex = nearestIndexForPosition(displayT);
            const displayedLevel = levels[displayedIndex];
            const displayedRank = levels.length > 1 ? rankAt(displayT * LEVEL_MAX) : undefined;
            const previewing = dragStep >= 0 && displayedIndex !== currentIndex;
            const ratio = displayT;
            const thumbRadius = 16;
            const travel = `calc(${(ratio * 100).toFixed(3)}% + ${Math.round(thumbRadius - thumbRadius * 2 * ratio)}px)`;
            const knifeLeft = maxIndex <= 0 ? `calc(100% - ${thumbRadius}px)` : ratio <= 0 ? `${thumbRadius}px` : travel;
            const fillWidth = ratio <= 0 ? "0px" : travel;
            const headLabel = levels.length > 1
                ? `${displayedRank} · ${displayedLevel?.name ?? currentEffort ?? ""}`
                : (displayedLevel?.name ?? currentEffort ?? "");

            const slider = levels.length > 0
                ? react.createElement(
                    "div",
                    { className: "dsh-lg-sliderBox" },
                    react.createElement(
                        "div",
                        { className: "dsh-lg-sliderHead" },
                        react.createElement("span", null, "推理深度"),
                        react.createElement("strong", null, headLabel)
                    ),
                    react.createElement(
                        "div",
                        {
                            className: "dsh-lg-rail",
                            "data-dragging": dragging ? "1" : "0",
                            "data-previewing": previewing ? "1" : "0"
                        },
                        react.createElement("div", { className: "dsh-lg-plate", "aria-hidden": true }),
                        react.createElement("div", { className: "dsh-lg-windings", "aria-hidden": true }),
                        react.createElement("div", { className: "dsh-lg-fill", style: { width: fillWidth }, "aria-hidden": true }),
                        react.createElement(
                            "div",
                            { className: "dsh-lg-knob", style: { left: knifeLeft }, "aria-hidden": true },
                            react.createElement("div", { className: "dsh-lg-knobCap" })
                        ),
                        react.createElement(
                            "div",
                            { className: "dsh-lg-ticks", "aria-hidden": true },
                            levels.map((level, index) => react.createElement("span", {
                                key: level.id,
                                className: "dsh-lg-tick",
                                "data-on": index <= displayedIndex ? "1" : "0",
                                "data-current": index === currentIndex ? "1" : "0"
                            }))
                        ),
                        react.createElement("input", {
                            className: "dsh-lg-input",
                            type: "range",
                            min: 0,
                            max: SLIDER_STEPS,
                            step: 1,
                            value: displayStep,
                            disabled: locked === true || levels.length < 2,
                            onInput: onSlide,
                            onChange: onSlide,
                            onMouseDown: () => markDragging(true),
                            onTouchStart: () => markDragging(true),
                            onMouseUp: commitEffort,
                            onTouchEnd: commitEffort,
                            onBlur: commitEffort,
                            onKeyUp: onSliderKeyUp,
                            onKeyDown: onSliderKeyDown,
                            "aria-label": "推理深度",
                            "aria-valuetext": headLabel
                        })
                    ),
                    // No caption while a drag is in flight: the thumb, the fill and the
                    // previewed backdrop already say where the release will land.
                    displayedLevel?.description
                        ? react.createElement("p", { className: "dsh-lg-desc" }, displayedLevel.description)
                        : null,
                    sliderError === null
                        ? null
                        : react.createElement("div", { className: "dsh-lg-error", role: "status" }, sliderError)
                )
                : null;

            const modelList = (state.status === "loading" || initialLoading) && state.groups.length === 0
                ? react.createElement("div", { className: "dsh-lg-status" }, "加载中…")
                : state.groups.length === 0
                    ? react.createElement(
                        "div",
                        { className: "dsh-lg-empty" },
                        state.error ? explainError(state.error) : "没有可用的模型。"
                    )
                    : state.groups.map((group) => react.createElement(
                        react.Fragment,
                        { key: group.id },
                        react.createElement("div", { className: "dsh-lg-group" }, group.name),
                        group.models.map((model) => {
                            const active = state.current?.provider === group.id && state.current?.model === model.id;
                            const failure = blockedModels[modelKey(group.id, model.id)];
                            const imageBlocked = draftHasImages && group.id === "deepseek-official";
                            return react.createElement(
                                "button",
                                {
                                    key: model.id,
                                    type: "button",
                                    className: "dsh-lg-model",
                                    "data-active": active ? "1" : "0",
                                    "data-blocked": failure !== undefined ? "1" : "0",
                                    "aria-disabled": failure !== undefined,
                                    title: failure ?? (imageBlocked ? "当前草稿包含图片，此模型不支持图片输入" : model.description),
                                    onClick: () => chooseModel(group, model)
                                },
                                react.createElement("span", { className: "dsh-lg-modelName" }, model.name),
                                failure !== undefined
                                    ? react.createElement("span", { className: "dsh-lg-modelDesc" }, failure)
                                    : model.description !== undefined
                                        ? react.createElement("span", { className: "dsh-lg-modelDesc" }, model.description)
                                        : null
                            );
                        })
                    ));

            const panel = open ? react.createElement(
                "div",
                { ref: panelRef, className: "dsh-lg-panel", role: "dialog", "aria-label": summary },
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "dsh-lg-row",
                        "aria-haspopup": "menu",
                        "aria-expanded": modelsOpen,
                        onClick: () => setModelsOpen((value) => !value)
                    },
                    react.createElement("span", { className: "dsh-lg-rowKey" }, "模型"),
                    react.createElement("span", { className: "dsh-lg-rowValue" }, modelLabel),
                    chevronIcon("dsh-lg-chevron", modelsOpen)
                ),
                modelsOpen ? react.createElement("div", { className: "dsh-lg-models" }, modelList) : null,
                slider === null
                    ? null
                    : react.createElement(react.Fragment, null, react.createElement("div", { className: "dsh-lg-divider" }), slider)
            ) : null;

            return react.createElement(
                "div",
                { className: "dsh-lg-root", "data-dsh-plugin": PLUGIN_ID, ref: rootRef },
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "dsh-lg-trigger",
                        "aria-label": summary,
                        title: summary,
                        "aria-haspopup": "dialog",
                        "aria-expanded": open,
                        disabled: locked === true,
                        onClick: () => setOpen((value) => !value)
                    },
                    rheostatIcon(),
                    react.createElement("span", { className: "dsh-lg-label" }, modelLabel),
                    rankLabel === undefined
                        ? null
                        : react.createElement("span", { className: "dsh-lg-rank" }, rankLabel),
                    chevronIcon("dsh-lg-chevron", open)
                ),
                panel
            );
        }
        //#endregion

        //#region settings card
        /**
         * The card the Plugins settings section dispatches for this plugin.
         *
         * The section only renders a card whose `key` is a settings namespace the
         * Host serves, and hands it the props its `inject()` returned — here the
         * bound `settingsScope` controller. Writes go through `scope.set(field,
         * value)`; the host validates and persists, and the same controller pushes
         * the new snapshot back, which is what re-applies the appearance live.
         */
        function SettingsCard(props) {
            const settings = props.scope;
            const snapshot = react.useSyncExternalStore(
                (listener) => settings.subscribe(listener),
                () => settings.getSnapshot()
            );
            const value = snapshot?.value;
            const background = value?.background !== false;
            const portrait = value?.portrait !== false;
            const persistent = value?.persistent !== false;
            const writable = snapshot?.writable !== false;
            const settled = snapshot?.status === "ready";
            const disabled = writable === false || settled === false;

            const row = (field, label, hint, checked) => react.createElement(
                "div",
                { className: "dsh-lg-cardRow" },
                react.createElement(
                    "span",
                    { className: "dsh-lg-cardRowText" },
                    react.createElement("span", { className: "dsh-lg-cardRowLabel" }, label),
                    react.createElement("span", { className: "dsh-lg-cardRowHint" }, hint)
                ),
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "dsh-lg-switch",
                        "data-on": checked ? "1" : "0",
                        "aria-pressed": checked,
                        "aria-label": label,
                        disabled,
                        onClick: () => {
                            void settings.set(field, !checked);
                        }
                    },
                    react.createElement("span", { className: "dsh-lg-switchKnob" })
                )
            );

            return react.createElement(
                "li",
                { className: "dsh-lg-card", "data-dsh-plugin": PLUGIN_ID },
                react.createElement(
                    "div",
                    { className: "dsh-lg-cardHead" },
                    react.createElement("span", { className: "dsh-lg-cardTitle" }, "梁神滑动变阻器"),
                    react.createElement(
                        "span",
                        { className: "dsh-lg-cardDesc" },
                        "把输入区的模型入口换成推理深度滑动变阻器；下面三项各自决定换档时要不要改外观、以及改多久。"
                    )
                ),
                row("background", "背景颜色", "换档时重染整页底色、发光、表面与主色按钮", background),
                row("portrait", "背景人物", "换档时切换人物图；单独开启时人物浮在原生底色上", portrait),
                row(
                    "persistent",
                    "常驻显示",
                    persistent
                        ? "关闭后只在拖动变阻器时出现，吸附后停留 0.75 秒即淡出，其余时间回到原生外观"
                        : "当前只在拖动变阻器时与吸附后 0.75 秒内出现，之后自动淡出",
                    persistent
                ),
                snapshot?.status === "error"
                    ? react.createElement("div", { className: "dsh-lg-cardNote" }, "设置读取失败，当前用的是默认值。")
                    : null,
                settled === false && snapshot?.status !== "error"
                    ? react.createElement("div", { className: "dsh-lg-cardNote" }, "正在读取设置…")
                    : null
            );
        }
        //#endregion

        /**
         * `modelDirectories.directoryFor()` runs on the caller's context, and from
         * DSH 0.1.2 it reads `ctx.remote.session`; cordis refuses a service the
         * caller did not declare. Older hosts do not provide it, and a declared but
         * missing service would park this plugin forever — so declare only what the
         * running host actually exposes.
         */
        const DIRECTORY_SERVICES = ["remote", "remote.session"];

        function injectFor(ctx) {
            const extra = typeof ctx.get === "function"
                ? DIRECTORY_SERVICES.filter((service) => ctx.get(service) !== undefined)
                : [];
            return [...new Set([...inject, ...extra])];
        }

        const apply = (ctx) => {
            ctx.inject(injectFor(ctx), (scope) => {
                const slots = scope.get("slots");
                const models = scope.get("modelDirectories");
                const sessions = scope.get("sessions");
                const theme = scope.get("theme") ?? null;
                const presenter = createPresenter(theme);

                const useEffectImpl = typeof scope.effect === "function" ? scope.effect.bind(scope) : ctx.effect.bind(ctx);
                useEffectImpl(() => () => presenter.dispose(), "lianggod-switcher: page backdrop");

                // ── settings ────────────────────────────────────────────────
                // The two appearance modes live in the host settings document, so the
                // switches sit in 设置 → 插件 → 插件配置 next to every other plugin's
                // options, and the values follow the profile instead of one browser.
                const settingsService = scope.get("settingsScope");
                let settingsController = null;
                if (settingsService !== undefined && typeof settingsService.bind === "function") {
                    try {
                        // `decode` short-circuits the scope's schema-envelope validation:
                        // the host half owns the namespace and already resolved both
                        // booleans, so the card reads the section verbatim instead of
                        // rehydrating a schemastery envelope on the client.
                        settingsController = settingsService.bind({
                            namespace: SETTINGS_NAMESPACE,
                            decode: (value) => (typeof value === "object" && value !== null ? value : {})
                        });
                    } catch {
                        settingsController = null;
                    }
                }

                const readModes = (snapshot) => {
                    const value = snapshot?.value;
                    presenter.setModes({
                        background: value?.background !== false,
                        portrait: value?.portrait !== false,
                        persistent: value?.persistent !== false
                    });
                };

                if (settingsController !== null) {
                    readModes(settingsController.getSnapshot());
                    useEffectImpl(
                        () => settingsController.subscribe(() => readModes(settingsController.getSnapshot())),
                        "lianggod-switcher: appearance settings"
                    );
                } else {
                    presenter.setModes(DEFAULT_MODES);
                }

                const seatRegistration = slots.inject(slotName, () => slots.register({
                    name: slotName,
                    priority: -100,
                    inject: (sessionId) => {
                        const directory = models.directoryFor(sessionId);
                        const available = sessions.subagentAddress(sessionId) === undefined;
                        // A write counts as accepted unless it rejects or resolves { ok: false }.
                        const accepted = (outcome) => !(outcome !== null && typeof outcome === "object" && outcome.ok === false);
                        return {
                            available,
                            presenter,
                            directory: directory.store,
                            load: () => {
                                if (available) return directory.load().catch(() => {});
                                return Promise.resolve();
                            },
                            select: (selection) => (
                                available ? directory.select(selection).then(accepted, () => false) : Promise.resolve(false)
                            )
                        };
                    }
                }, LianggodSeat));

                const cardRegistration = settingsController === null
                    ? null
                    : slots.inject(SETTINGS_SLOT, () => slots.register({
                        name: SETTINGS_SLOT,
                        key: SETTINGS_NAMESPACE,
                        inject: () => ({ scope: settingsController })
                    }, SettingsCard));

                return () => {
                    if (typeof cardRegistration === "function") cardRegistration();
                    if (typeof seatRegistration === "function") seatRegistration();
                };
            });
        };

        const Config = {
            "~standard": {
                version: 1,
                vendor: PLUGIN_ID,
                validate(config) {
                    if (config === undefined || config === null) return { value: {} };
                    if (typeof config !== "object" || Array.isArray(config)) {
                        return { issues: [{ message: "config must be an object" }] };
                    }
                    return { value: config };
                }
            }
        };

        exports.name = name;
        exports.inject = inject;
        exports.apply = apply;
        exports.Config = Config;
        return module.exports;
    }
});
