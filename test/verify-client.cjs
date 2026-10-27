/**
 * Headless smoke test for index.js (the browser half).
 *
 * The client bundle cannot be imported as a plain ESM module (it registers
 * itself on `window.__ModuleLoader__`), so this harness rebuilds just enough of
 * the browser to run the real file: a micro-DOM, a fake React, and fake cordis
 * services. It asserts the observable contract only — style injection, slot
 * registration, the presenter's DOM/token footprint, and full teardown.
 *
 *   node verify-client.cjs
 */
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

//#region micro-DOM
/** Every <img> the bundle creates, in order — lets the test play the decoder. */
const createdImages = [];

function createStyle() {
    const values = new Map();
    return {
        setProperty(name, value) { values.set(name, value); },
        removeProperty(name) { values.delete(name); },
        getPropertyValue(name) { return values.get(name) ?? ""; },
        get size() { return values.size; },
        entries() { return [...values.entries()]; }
    };
}

function createElement(tagName) {
    const node = {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        isConnected: false,
        offsetWidth: 100,
        children: [],
        dataset: {},
        attributes: {},
        style: createStyle(),
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
        removeAttribute(name) { delete this.attributes[name]; },
        appendChild(node) {
            this.append(node);
            return node;
        },
        append(...nodes) {
            for (const child of nodes) {
                child.parentNode = this;
                child.isConnected = this.isConnected;
                this.children.push(child);
            }
        },
        prepend(...nodes) {
            for (const child of nodes) {
                child.parentNode = this;
                child.isConnected = this.isConnected;
            }
            this.children.unshift(...nodes);
        },
        replaceChildren(...nodes) {
            for (const child of this.children) {
                child.parentNode = null;
                child.isConnected = false;
            }
            this.children = [];
            this.append(...nodes);
        },
        remove() {
            if (this.parentNode === null) return;
            const parent = this.parentNode;
            parent.children = parent.children.filter((child) => child !== this);
            this.parentNode = null;
            this.isConnected = false;
        },
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40 };
        },
        querySelector() { return null; },
        addEventListener() {},
        removeEventListener() {}
    };
    if (node.tagName === "IMG") createdImages.push(node);
    return node;
}

function createDocument() {
    const head = createElement("head");
    const body = createElement("body");
    body.isConnected = true;
    const documentElement = createElement("html");
    documentElement.isConnected = true;
    const styles = [];

    const document = {
        head,
        body,
        documentElement,
        createElement: (tagName) => createElement(tagName),
        querySelector(selector) {
            return styles.find((tag) => selector.includes(JSON.stringify(tag.dataset.pluginCss))) ?? null;
        },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        defaultView: null
    };

    // Track style tags the bundle appends so the dedupe path can be exercised.
    const appendChild = head.appendChild.bind(head);
    head.appendChild = (node) => {
        if (node.tagName === "STYLE") styles.push(node);
        appendChild(node);
    };
    document.__styles = styles;
    return document;
}
//#endregion

//#region fake environment
const document = createDocument();
const localStorage = new Map();

// Controllable timers: the transient-appearance mode schedules a 500ms linger and
// a 320ms fade, so the test advances them explicitly instead of waiting.
const pendingTimers = [];
let timerSeq = 0;
function scheduleTimer(callback, delay) {
    const id = ++timerSeq;
    pendingTimers.push({ id, callback, delay: Number(delay) || 0 });
    return id;
}
function cancelScheduledTimer(id) {
    const index = pendingTimers.findIndex((timer) => timer.id === id);
    if (index >= 0) pendingTimers.splice(index, 1);
}
/** Run the single earliest pending timer; false when there is none. */
function runNextTimer() {
    if (pendingTimers.length === 0) return false;
    pendingTimers.sort((left, right) => left.delay - right.delay);
    const next = pendingTimers.shift();
    next.callback();
    return true;
}

const windowStub = {
    __ModuleLoader__: null,
    localStorage: {
        getItem: (key) => (localStorage.has(key) ? localStorage.get(key) : null),
        setItem: (key, value) => localStorage.set(key, String(value)),
        removeItem: (key) => localStorage.delete(key)
    },
    innerWidth: 1280,
    innerHeight: 800,
    document,
    setTimeout: (callback, delay) => scheduleTimer(callback, delay),
    clearTimeout: (id) => cancelScheduledTimer(id),
    // Paint synchronously: preview() coalesces on this, so assertions see the result.
    requestAnimationFrame: (callback) => {
        callback();
        return 0;
    }
};
document.defaultView = windowStub;

let registration = null;

/**
 * A tiny hook runtime so the real function component can be rendered and its
 * handlers driven. Effects are recorded as no-ops (their bodies are covered by
 * the presenter assertions above); state/refs persist across renders.
 */
const hookSlots = [];
let hookCursor = 0;
const hookRuntime = {
    begin() {
        hookCursor = 0;
    },
    useState(initial) {
        const index = hookCursor++;
        if (!(index in hookSlots)) hookSlots[index] = typeof initial === "function" ? initial() : initial;
        return [
            hookSlots[index],
            (next) => {
                hookSlots[index] = typeof next === "function" ? next(hookSlots[index]) : next;
            }
        ];
    },
    useRef(initial) {
        const index = hookCursor++;
        if (!(index in hookSlots)) hookSlots[index] = { current: initial };
        return hookSlots[index];
    },
    useMemo(factory) {
        hookCursor += 1;
        return factory();
    },
    useEffect() {
        hookCursor += 1;
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
        hookCursor += 1;
        return getSnapshot();
    }
};

const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: "Fragment",
    useState: (initial) => hookRuntime.useState(initial),
    useEffect: () => hookRuntime.useEffect(),
    useMemo: (factory) => hookRuntime.useMemo(factory),
    useRef: (value) => hookRuntime.useRef(value),
    useSyncExternalStore: (subscribe, getSnapshot) => hookRuntime.useSyncExternalStore(subscribe, getSnapshot)
};

/** Render one function component through the hook runtime. */
function renderTree(component, props) {
    hookRuntime.begin();
    return component(props);
}

/** Depth-first search for the first element whose className carries a token. */
function findByClass(node, className) {
    if (node === null || typeof node !== "object") return null;
    const value = node.props?.className;
    if (typeof value === "string" && value.split(/\s+/).includes(className)) return node;
    for (const child of node.children ?? []) {
        const hit = findByClass(child, className);
        if (hit !== null) return hit;
    }
    return null;
}

const source = readFileSync(join(__dirname, "..", "index.js"), "utf8");
const sandbox = {
    window: windowStub,
    document,
    console,
    react: React,
    module: { exports: {} },
    exports: {}
};
sandbox.globalThis = sandbox;

windowStub.__ModuleLoader__ = {
    load({ id, factory }) {
        registration = { id, factory };
    }
};

vm.runInNewContext(source, sandbox, { filename: "index.js" });

assert.ok(registration !== null, "bundle must register itself on window.__ModuleLoader__");
assert.equal(registration.id, "dsh-lianggod-switcher");

const client = registration.factory((specifier) => {
    if (specifier === "react") return React;
    throw new Error(`unexpected require: ${specifier}`);
});

//#endregion

//#region assertions
async function main() {
assert.equal(client.name, "lianggod-switcher");
assert.deepEqual(
    [...client.inject],
    ["slots", "modelDirectories", "sessions", "settingsScope", "connection", "remote"],
    "declares the seat services plus the settings transport"
);
assert.equal(typeof client.apply, "function");
assert.equal(typeof client.Config["~standard"].validate, "function");

// Styles are injected at module load, deduped by data-plugin-css.
assert.equal(document.__styles.length, 1, "exactly one style tag");
const styleTag = document.__styles[0];
assert.equal(styleTag.dataset.plugin, "dsh-lianggod-switcher");
for (const selector of [".dsh-lg-backdrop", ".dsh-lg-rail", ".dsh-lg-input", ".dsh-lg-switch"]) {
    assert.ok(styleTag.textContent.includes(selector), `stylesheet must style ${selector}`);
}

// ── fake cordis client services ────────────────────────────────────────────
const overrideCalls = [];
const themeService = {
    getTheme: () => ({ preference: "light", active: { id: "light", colorScheme: "light", tokens: {} } }),
    overrideTokens(sourceId, tokens) {
        overrideCalls.push({ sourceId, tokens });
        return () => {
            overrideCalls.push({ sourceId, disposed: true });
        };
    }
};

const levels = [
    { id: "low", name: "Low", description: "quick" },
    { id: "medium", name: "Medium" },
    { id: "high", name: "High", description: "thorough" }
];
const directoryStore = {
    snapshot: {
        status: "ready",
        current: { provider: "deepseek-official", model: "deepseek-v4", reasoningEffort: "medium" },
        groups: [{
            id: "deepseek-official",
            name: "DeepSeek",
            models: [{
                id: "deepseek-v4",
                name: "DeepSeek V4",
                reasoning: { efforts: levels, defaultEffort: "medium" }
            }]
        }]
    },
    subscribe() { return () => {}; },
    getSnapshot() { return this.snapshot; }
};
const selections = [];
const modelDirectories = {
    directoryFor(sessionId) {
        assert.equal(sessionId, "session-1");
        return {
            store: directoryStore,
            load: () => Promise.resolve(directoryStore.snapshot),
            select: (selection) => {
                selections.push(selection);
                return Promise.resolve({ ok: true });
            }
        };
    }
};

let slotRegistration = null;
let slotInjectedInto = null;
const registrations = [];
const slotsService = {
    inject(key, callback) {
        slotInjectedInto = key;
        callback();
        return () => {};
    },
    register(options, component) {
        registrations.push({ options, component });
        if (options.name === "conversation.input.model") slotRegistration = { options, component };
        return () => {};
    }
};

// ── fake settings scope (the host half owns the namespace) ─────────────────
let settingsValue = { background: true, portrait: true, persistent: true };
let settingsListener = null;
const settingsWrites = [];
const settingsController = {
    getSnapshot: () => ({
        status: "ready",
        value: settingsValue,
        base: undefined,
        user: settingsValue,
        revision: 1,
        writable: true,
        mode: "host"
    }),
    subscribe(listener) {
        settingsListener = listener;
        return () => {
            settingsListener = null;
        };
    },
    load() {},
    set(field, value) {
        settingsWrites.push([field, value]);
        settingsValue = { ...settingsValue, [field]: value };
        settingsListener?.();
        return Promise.resolve();
    },
    unset(field) {
        settingsWrites.push([field, undefined]);
        return Promise.resolve();
    }
};
let boundNamespace = null;
const settingsScopeService = {
    bind(spec) {
        boundNamespace = spec.namespace;
        return settingsController;
    }
};

const sessionsService = { subagentAddress: () => undefined };
const services = {
    slots: slotsService,
    modelDirectories,
    sessions: sessionsService,
    theme: themeService,
    settingsScope: settingsScopeService,
    connection: { api: {}, isLoopback: true },
    remote: { $on: () => () => {} }
};

const disposers = [];
const scope = {
    get: (name) => services[name],
    effect: (factory) => {
        disposers.push(factory());
        return () => {};
    }
};
const applier = {
    get: (name) => services[name],
    inject(deps, callback) {
        assert.deepEqual(
            [...deps],
            ["slots", "modelDirectories", "sessions", "settingsScope", "connection", "remote"],
            "declares the services it consumes"
        );
        return callback(scope);
    },
    effect: (factory) => {
        disposers.push(factory());
        return () => {};
    }
};

client.apply(applier);

assert.equal(slotInjectedInto, "settings.plugin.item", "injects into the settings card slot last");
assert.equal(boundNamespace, "lianggod-switcher", "binds the host settings namespace");
assert.ok(slotRegistration !== null, "registers a seat occupant");
assert.equal(slotRegistration.options.name, "conversation.input.model");
assert.equal(slotRegistration.options.priority, -100, "takes the seat over from the native selector");
assert.equal(typeof slotRegistration.options.inject, "function");
assert.equal(slotRegistration.component.name, "LianggodSeat");

// ── settings card ──────────────────────────────────────────────────────────
const cardRegistration = registrations.find((entry) => entry.options.name === "settings.plugin.item");
assert.ok(cardRegistration !== undefined, "registers a card in 设置 → 插件 → 插件配置");
assert.equal(cardRegistration.options.key, "lianggod-switcher", "keyed by the namespace the host serves");
assert.equal(cardRegistration.component.name, "SettingsCard");
const cardProps = cardRegistration.options.inject();
assert.equal(cardProps.scope, settingsController, "the card edits the bound settings scope");
await settingsController.set("background", false);
assert.deepEqual(settingsWrites.at(-1), ["background", false]);
await settingsController.set("background", true);

const seatProps = slotRegistration.options.inject("session-1");
assert.equal(seatProps.available, true);
assert.equal(seatProps.directory, directoryStore);
assert.equal(typeof seatProps.load, "function");
assert.equal(typeof seatProps.select, "function");
assert.equal(typeof seatProps.presenter.preview, "function");

await seatProps.load();
const accepted = await seatProps.select({ provider: "deepseek-official", model: "deepseek-v4", reasoningEffort: "high" });
assert.equal(accepted, true);
assert.equal(selections.length, 1);
assert.equal(selections[0].reasoningEffort, "high");

// ── presenter footprint ────────────────────────────────────────────────────
const backdrop = () => document.body.children.find((child) => child.className === "dsh-lg-backdrop");

// The settings read at apply time already turned both modes on.
assert.deepEqual({ ...seatProps.presenter.getModes() }, { background: true, portrait: true, persistent: true });
assert.ok(backdrop() !== undefined, "backdrop mounted under <body> once both modes are on");
seatProps.presenter.setIdle(false);
seatProps.presenter.setLevel(0, false);
assert.ok(backdrop() !== undefined, "backdrop mounted under <body>");
assert.equal(document.body.children[0], backdrop(), "backdrop is prepended so z-index:-1 stays below app content");
assert.equal(document.documentElement.dataset.dshLianggodBackground, "on");
assert.equal(document.body.style.getPropertyValue("--dsh-lg-accent"), "rgb(62 110 214)");
// Enabling, un-idling and the first committed level each (re)assert the token
// layer; what matters is that the layer exists, one per source, with pairs.
const callsAfterMount = overrideCalls.length;
assert.ok(callsAfterMount >= 1, "token layer registered");
for (const call of overrideCalls) assert.equal(call.sourceId, "dsh-lianggod-switcher");
const currentLayer = overrideCalls.filter((call) => call.disposed !== true).at(-1);
assert.ok(currentLayer !== undefined, "an active token layer exists");
// Cross-realm objects: compare fields, not prototypes.
const base = currentLayer.tokens["--dsw-alias-bg-base"];
assert.equal(base?.light, "transparent");
assert.equal(base?.dark, "transparent");
for (const [name, value] of Object.entries(currentLayer.tokens)) {
    assert.equal(typeof value.light, "string", `${name} carries a light value`);
    assert.equal(typeof value.dark, "string", `${name} carries a dark value`);
}

// Dragging only previews; the palette must follow continuously.
seatProps.presenter.preview(1);
assert.equal(document.body.style.getPropertyValue("--dsh-lg-accent"), "rgb(172 120 16)", "full depth resolves to the gold stop");
assert.equal(overrideCalls.length, callsAfterMount, "previewing does not re-tint the alias tokens");

seatProps.presenter.setOrigin(640, 400);
assert.equal(document.body.style.getPropertyValue("--dsh-lg-fx"), "640.00%");
seatProps.presenter.setOrigin(50.5, 78.25);
assert.equal(document.body.style.getPropertyValue("--dsh-lg-fx"), "50.50%");

const mark = backdrop().children.find((child) => child.className === "dsh-lg-mark");
seatProps.presenter.setLevel(0.5, true);
assert.equal(mark.textContent, "梁圣", "mid axis reports its rank");
assert.equal(overrideCalls.length, callsAfterMount + 1, "a committed level re-tints the alias tokens");

// ── portrait layer ─────────────────────────────────────────────────────────
/** Play the browser: run every pending image handler until the queue drains. */
function flushImages() {
    for (let pass = 0; pass < 6; pass += 1) {
        let fired = false;
        for (const image of createdImages) {
            const handler = image.onload;
            if (typeof handler !== "function" || image.src === undefined) continue;
            image.onload = undefined;
            handler();
            fired = true;
        }
        if (!fired) break;
    }
}

const portraitLayer = () => backdrop()?.children.find((child) => child.className === "dsh-lg-portrait");
assert.ok(portraitLayer() !== undefined, "portrait layer mounted inside the backdrop");
assert.deepEqual(portraitLayer().children.map((image) => image.tagName), ["IMG", "IMG"], "two frames for cross-fade");
assert.equal(portraitLayer().children[0].src, undefined, "no frame selected before an anchor decodes");
assert.ok(Number(document.body.style.getPropertyValue("--dsh-lg-portrait-opacity")) > 0, "portrait opacity follows depth");
assert.ok(document.body.style.getPropertyValue("--dsh-lg-portrait-width").endsWith("vw"), "portrait width follows depth");

// Decode every probe, then commit a depth: the nearest anchor must win.
flushImages();
assert.equal(createdImages.length >= 24, true, "all 24 anchors were preloaded");
const activeFrame = () => portraitLayer().children.find((image) => image.dataset.active === "1");
assert.ok(activeFrame() !== undefined, "an anchor is shown once decoded");
assert.ok(activeFrame().src.endsWith("bridge-15.webp"), `level 15 lands on its exact anchor, got ${activeFrame().src}`);

seatProps.presenter.setLevel(1, false);
flushImages();
assert.ok(activeFrame().src.endsWith("stage-30.webp"), `level 30 resolves to stage-30, got ${activeFrame().src}`);

seatProps.presenter.setLevel(0, false);
flushImages();
assert.ok(activeFrame().src.endsWith("stage-00.webp"), `level 0 resolves to stage-00, got ${activeFrame().src}`);
assert.equal(portraitLayer().children.filter((image) => image.dataset.active === "1").length, 1, "only one frame visible");

// The swap is a real cross-fade: the outgoing frame is marked leaving (longer
// fade) in the same commit that activates the incoming one, so the two opacity
// transitions overlap instead of running back to back.
const leavingFrame = () => portraitLayer().children.find((image) => image.dataset.leaving === "1");
assert.ok(leavingFrame() !== undefined, "the outgoing frame is still fading while the incoming one fades in");
assert.notEqual(leavingFrame(), activeFrame(), "leaving and active are different frames");
assert.equal(leavingFrame().dataset.active, "0", "the leaving frame is already on its way out");

// ── stepless drag: continuous preview, snap + one commit on release ────────
// Renders the real seat component through the hook runtime and drives its
// handlers, so the "无极拖动 / 松手吸附" contract is verified end to end.
const seatComponent = slotRegistration.component;
const view = () => renderTree(seatComponent, seatProps);
const track = (value) => ({
    value: String(value),
    getBoundingClientRect: () => ({ left: 100, top: 700, width: 200, height: 40 })
});

const closedRender = view();
assert.equal(findByClass(closedRender, "dsh-lg-input"), null, "the slider lives inside the popover");
findByClass(closedRender, "dsh-lg-trigger").props.onClick();
const firstRender = view();
const rangeInput = findByClass(firstRender, "dsh-lg-input");
assert.equal(rangeInput.props.type, "range");
assert.equal(rangeInput.props.min, 0);
assert.equal(rangeInput.props.max, 1000, "the thumb is stepless: 1000 positions, not one per level");
assert.equal(rangeInput.props.step, 1);
assert.equal(rangeInput.props.value, 500, "at rest the thumb sits on the committed depth (1 of 3)");

const committedAccent = document.body.style.getPropertyValue("--dsh-lg-accent");
const selectionsBeforeDrag = selections.length;

// Drag to 90% of the track: the backdrop must follow continuously and nothing
// may be submitted yet.
rangeInput.props.onMouseDown();
rangeInput.props.onInput({ currentTarget: track(900) });
const dragged = view();
const draggedRail = findByClass(dragged, "dsh-lg-rail");
assert.equal(draggedRail.props["data-dragging"], "1", "rail knows the pointer is down");
assert.equal(draggedRail.props["data-previewing"], "1", "preview mode is announced");
const draggedKnob = findByClass(dragged, "dsh-lg-knob");
assert.ok(draggedKnob.props.style.left.startsWith("calc(90.000%"), `thumb tracks the pointer, got ${draggedKnob.props.style.left}`);
assert.equal(selections.length, selectionsBeforeDrag, "dragging never writes to the model");
assert.notEqual(
    document.body.style.getPropertyValue("--dsh-lg-accent"),
    committedAccent,
    "the palette flows continuously while dragging"
);
// Dragging shows no "preview mode" caption — only the level's own description.
assert.equal(findByClass(dragged, "dsh-lg-descSnap"), null, "no release-to-snap caption while dragging");

// Release: snap to the nearest available depth, commit exactly once.
rangeInput.props.onMouseUp({ currentTarget: track(900) });
assert.equal(selections.length, selectionsBeforeDrag + 1, "release commits exactly once");
assert.equal(selections.at(-1).reasoningEffort, "high", "snapped to the nearest depth");
const released = view();
assert.equal(findByClass(released, "dsh-lg-rail").props["data-dragging"], "0", "drag ended");
assert.ok(
    findByClass(released, "dsh-lg-knob").props.style.left.startsWith("calc(100.000%"),
    "thumb springs onto the snapped depth"
);
assert.equal(findByClass(released, "dsh-lg-desc")?.children[0], "thorough", "the caption is the level description");
directoryStore.snapshot.current.reasoningEffort = "high";

// A release that lands on the depth already committed must not write again.
const beforeSameDepth = selections.length;
const sameDepth = view();
const sameInput = findByClass(sameDepth, "dsh-lg-input");
sameInput.props.onMouseDown();
sameInput.props.onInput({ currentTarget: track(980) });
sameInput.props.onMouseUp({ currentTarget: track(980) });
assert.equal(selections.length, beforeSameDepth, "releasing on the committed depth writes nothing");
assert.ok(
    findByClass(view(), "dsh-lg-knob").props.style.left.startsWith("calc(100.000%"),
    "and the thumb still lands on that depth"
);

// Keyboard hops one available depth at a time and commits on key-up.
const keyboard = view();
const keyboardInput = findByClass(keyboard, "dsh-lg-input");
keyboardInput.props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
assert.ok(
    findByClass(view(), "dsh-lg-knob").props.style.left.startsWith("calc(50.000%"),
    "an arrow key moves a whole level, not 1/1000 of the track"
);
assert.equal(selections.length, beforeSameDepth, "the arrow itself does not commit");
keyboardInput.props.onKeyUp({ key: "ArrowLeft" });
assert.equal(selections.length, beforeSameDepth + 1, "key-up commits");
assert.equal(selections.at(-1).reasoningEffort, "medium");
directoryStore.snapshot.current.reasoningEffort = "medium";

// Escape abandons a drag without writing.
const escapeRender = view();
const escapeInput = findByClass(escapeRender, "dsh-lg-input");
escapeInput.props.onMouseDown();
escapeInput.props.onInput({ currentTarget: track(80) });
escapeInput.props.onKeyDown({ key: "Escape" });
const escaped = view();
assert.ok(
    findByClass(escaped, "dsh-lg-knob").props.style.left.startsWith("calc(50.000%"),
    "Escape restores the committed depth"
);
assert.equal(selections.length, beforeSameDepth + 1, "Escape writes nothing");

// ── the two switches are independent ──────────────────────────────────────
// 1) portrait only: the canvas opens, but the gradient wash and the recoloured
//    surfaces are gone and the native palette is left alone.
const tokensBeforePortraitOnly = overrideCalls.length;
seatProps.presenter.setModes({ background: false, portrait: true });
assert.ok(backdrop() !== undefined, "portrait-only keeps the layer mounted");
assert.equal(backdrop().dataset.plain, "1", "gradient wash dropped in portrait-only mode");
assert.equal(portraitLayer().dataset.on, "1", "portrait still visible");
const portraitOnlyLayer = overrideCalls.filter((call) => call.disposed !== true).at(-1);
assert.equal(Object.keys(portraitOnlyLayer.tokens).length, 1, "portrait-only touches the canvas token only");
assert.ok(overrideCalls.length > tokensBeforePortraitOnly);

// 2) colour only: the portrait hides, everything else stays recoloured.
seatProps.presenter.setModes({ background: true, portrait: false });
assert.ok(backdrop() !== undefined, "colour-only keeps the layer mounted");
assert.equal(backdrop().dataset.plain, "0", "gradient wash restored");
assert.equal(portraitLayer().dataset.on, "0", "portrait hidden");
const colourOnlyLayer = overrideCalls.filter((call) => call.disposed !== true).at(-1);
assert.ok(Object.keys(colourOnlyLayer.tokens).length > 1, "colour mode re-tints the surface set");

// 3) both off: nothing is painted and no token layer survives.
seatProps.presenter.setModes({ background: false, portrait: false });
assert.equal(backdrop(), undefined, "backdrop removed when both switches are off");
assert.equal(document.body.style.size, 0, "every body custom property is retracted");
assert.equal(overrideCalls.at(-1).disposed, true, "token layer disposed");
assert.equal(document.documentElement.dataset.dshLianggodBackground, undefined);

// 4) a settings change reaches the presenter (this is the live edit path).
seatProps.presenter.setModes({ background: true, portrait: true, persistent: true });
assert.ok(backdrop() !== undefined, "re-enabling remounts");

// ── third switch: transient appearance (只在拖动时 + 吸附后 750ms) ──────────
seatProps.presenter.setModes({ background: true, portrait: true, persistent: false });
assert.equal(backdrop(), undefined, "transient mode starts hidden — no drag has happened yet");
assert.equal(document.body.style.size, 0, "and the native appearance is untouched");
assert.equal(document.documentElement.dataset.dshLianggodBackground, undefined);

// Pressing the rheostat reveals it.
seatProps.presenter.setDragging(true);
assert.ok(backdrop() !== undefined, "pressing on the rheostat brings the appearance back");
assert.equal(backdrop().dataset.on, "1");
seatProps.presenter.preview(0.8);
assert.ok(Number(document.body.style.getPropertyValue("--dsh-lg-portrait-opacity")) > 0, "and it previews live");

// Release: it stays for the linger, then fades and hands the page back.
seatProps.presenter.setDragging(false);
assert.ok(backdrop() !== undefined, "the appearance lingers after the snap");
assert.equal(
    pendingTimers.some((timer) => timer.delay === 750),
    true,
    "the linger is 750ms"
);
assert.equal(runNextTimer(), true, "a linger timer is pending");
assert.ok(backdrop() !== undefined, "still mounted while it fades");
assert.equal(backdrop().dataset.on, "0", "the layer is fading out");
assert.equal(runNextTimer(), true, "a fade timer is pending");
assert.equal(backdrop(), undefined, "then it is gone");
assert.equal(document.body.style.size, 0, "and every surface token is restored");
assert.equal(document.documentElement.dataset.dshLianggodBackground, undefined);

// A new drag brings it straight back, and the switch turns it persistent again.
seatProps.presenter.setDragging(true);
assert.ok(backdrop() !== undefined, "a second drag reveals it again");
seatProps.presenter.setDragging(false);
assert.equal(runNextTimer(), true);
assert.equal(runNextTimer(), true);
assert.equal(backdrop(), undefined);
seatProps.presenter.setModes({ background: true, portrait: true, persistent: true });
assert.ok(backdrop() !== undefined, "flipping the switch back on makes it permanent");
assert.equal(seatProps.presenter.getModes().persistent, true);

seatProps.presenter.dispose();
assert.equal(backdrop(), undefined, "dispose tears the layer down");
assert.equal(document.body.style.size, 0);

// The fiber effects must own the same teardown paths (presenter + settings watch).
assert.equal(disposers.length, 2, "presenter teardown and the settings subscription are fiber effects");
assert.equal(disposers.every((dispose) => typeof dispose === "function"), true);
for (const dispose of disposers) dispose();
assert.equal(document.body.style.size, 0);
assert.equal(settingsListener, null, "unsubscribed from settings on teardown");

// ── Config validation ──────────────────────────────────────────────────────
const validate = client.Config["~standard"].validate;
assert.equal(Object.keys(validate(undefined).value).length, 0);
assert.equal(validate({ anything: 1 }).value.anything, 1);
assert.ok(Array.isArray(validate([]).issues), "rejects an array");

console.log("ok — client half verified");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//#endregion
