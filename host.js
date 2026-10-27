/**
 * Host half of dsh-lianggod-switcher.
 *
 * The behaviour (rheostat seat + depth-driven background and portrait) lives in
 * the browser bundle. This module exists for two reasons:
 *
 *  1. The Cordis loader needs a mountable host entry, and
 *     `@deepseek-ai/dsh-client-modules` only scans *enabled loader entries* for
 *     `dsh.client` packages — the row inserted by cordis.patch.yml is what makes
 *     the browser half discoverable at all.
 *  2. It serves the portrait anchors. `dsh.client` exposes exactly one script
 *     (the bundle); binary assets need a real HTTP route, and `ctx.webServer`
 *     is the sanctioned one. `exact` routes throw on a duplicate path, so each
 *     file gets its own registration, an ETag, `304` on `If-None-Match`, and a
 *     stream that is destroyed if the plugin unloads mid-response.
 *
 * The images live in ./assets/portrait and may be replaced with any WEBP of the
 * same names; nothing else needs to change.
 */

import { createReadStream, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const name = "lianggod-switcher";

export const inject = ["webServer"];

const PACKAGE_ID = "dsh-lianggod-switcher";
const ASSET_PREFIX = `/plugins/${PACKAGE_ID}/assets/portrait/`;

/** Anchor files in depth order; the browser half maps a level onto the nearest one. */
const PORTRAIT_FILES = [
    "stage-00.webp",
    "level-01.webp",
    "level-03.webp",
    "level-04.webp",
    "stage-06.webp",
    "level-07.webp",
    "level-09.webp",
    "level-10.webp",
    "stage-12.webp",
    "level-13.webp",
    "level-14.webp",
    "bridge-15.webp",
    "level-16.webp",
    "level-17.webp",
    "stage-18.webp",
    "level-19.webp",
    "level-21.webp",
    "level-22.webp",
    "stage-24.webp",
    "level-25.webp",
    "bridge-27.webp",
    "level-28.webp",
    "level-29.webp",
    "stage-30.webp"
];

/**
 * Schemastery-compatible config schema. The plugin accepts an object (or
 * nothing at all) so a profile can carry `config:` without a validation error;
 * every knob that matters is a user setting, not loader config.
 */
export const Config = {
    "~standard": {
        version: 1,
        vendor: PACKAGE_ID,
        validate(config) {
            if (config === undefined || config === null) return { value: {} };
            if (typeof config !== "object" || Array.isArray(config)) {
                return {
                    issues: [{
                        message: "dsh-lianggod-switcher config must be an object"
                    }]
                };
            }
            return { value: config };
        }
    }
};

//#region user settings
/**
 * Settings namespace owned by this plugin. The browser half claims the same
 * string in 设置 → 插件 → 插件配置: the configurable-plugins tab only dispatches
 * cards whose `key` is a namespace the Host actually serves, so registering
 * here is what makes the card appear at all.
 */
export const SETTINGS_NAMESPACE = "lianggod-switcher";
/** Booleans the card edits, in display order. */
const SETTING_FIELDS = ["background", "portrait", "persistent"];
const SETTING_DEFAULTS = Object.freeze({ background: true, portrait: true, persistent: true });

/**
 * Minimal Schemastery-shaped schema for the settings service.
 *
 * `SettingsProvider` uses a namespace schema two ways only: it CALLS it to
 * validate/complete a section (throwing on an invalid one) and reads
 * `schema.toJSON()` for the configuration descriptors. Hand-rolling those two
 * members keeps this package dependency-free — importing
 * `@deepseek-ai/schemastery` is not possible from a user-installed plugin
 * directory (the junction only exists under the profile), and vendoring a
 * second Schemastery copy would shadow the shared instance.
 *
 * `toJSON()` reproduces the ref-graph envelope the real Schemastery emits for
 * this shape (`{ uid, refs }`), so a generic consumer can rehydrate it. The
 * browser half additionally binds with its own `decode`, so it never depends on
 * this envelope being byte-identical to a real one.
 */
function createSettingsSchema() {
    const schema = (input) => {
        if (input === undefined || input === null) return { ...SETTING_DEFAULTS };
        if (typeof input !== "object" || Array.isArray(input)) {
            throw new TypeError(`settings "${SETTINGS_NAMESPACE}" must be an object`);
        }
        const value = {};
        for (const field of SETTING_FIELDS) {
            const raw = input[field];
            if (raw === undefined) value[field] = SETTING_DEFAULTS[field];
            else if (typeof raw === "boolean") value[field] = raw;
            else throw new TypeError(`$.${field} expected boolean but got ${typeof raw}`);
        }
        return value;
    };
    schema.toJSON = () => ({
        uid: 4,
        refs: {
            1: {
                type: "boolean",
                meta: {
                    default: SETTING_DEFAULTS.background,
                    description: "Recolor the page canvas, surfaces and accent when the reasoning depth changes."
                }
            },
            2: {
                type: "boolean",
                meta: {
                    default: SETTING_DEFAULTS.portrait,
                    description: "Show the depth-anchored portrait behind the UI."
                }
            },
            3: {
                type: "boolean",
                meta: {
                    default: SETTING_DEFAULTS.persistent,
                    description: "Keep the appearance visible at all times; when off it only appears while the rheostat is dragged and for half a second after the snap."
                }
            },
            4: {
                type: "object",
                meta: { default: {} },
                dict: { background: 1, portrait: 2, persistent: 3 }
            }
        }
    });
    return schema;
}
//#endregion

function send(res, status, headers = {}) {
    res.writeHead(status, {
        "X-Content-Type-Options": "nosniff",
        ...headers
    });
    res.end();
}

/** Resolve every anchor once at activation; a missing optional file is skipped. */
function collectAssets() {
    const assets = new Map();
    for (const file of PORTRAIT_FILES) {
        const path = fileURLToPath(new URL(`./assets/portrait/${file}`, import.meta.url));
        let info;
        try {
            info = statSync(path);
        } catch {
            continue;
        }
        if (!info.isFile()) continue;
        assets.set(`${ASSET_PREFIX}${file}`, {
            path,
            size: info.size,
            etag: `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
        });
    }
    return assets;
}

function createHandler(assets, activeStreams) {
    return (req, res) => {
        const method = req.method ?? "GET";
        if (method !== "GET" && method !== "HEAD") {
            send(res, 405, { Allow: "GET, HEAD" });
            return;
        }

        let pathname;
        try {
            pathname = new URL(req.url ?? "/", "http://dsh.local").pathname;
        } catch {
            send(res, 404);
            return;
        }

        const asset = assets.get(pathname);
        if (asset === undefined) {
            send(res, 404);
            return;
        }

        if (req.headers["if-none-match"] === asset.etag) {
            send(res, 304, { ETag: asset.etag });
            return;
        }

        const headers = {
            "Cache-Control": "private, max-age=3600, must-revalidate",
            "Content-Length": String(asset.size),
            "Content-Type": "image/webp",
            ETag: asset.etag
        };

        if (method === "HEAD") {
            send(res, 200, headers);
            return;
        }

        res.writeHead(200, { "X-Content-Type-Options": "nosniff", ...headers });
        const stream = createReadStream(asset.path);
        activeStreams.add(stream);
        const release = () => activeStreams.delete(stream);
        stream.once("close", release);
        stream.once("end", release);
        stream.once("error", () => {
            release();
            if (!res.headersSent) send(res, 500);
            else res.destroy();
        });
        res.once("close", () => {
            if (!stream.destroyed) stream.destroy();
        });
        stream.pipe(res);
    };
}

/** The composition entry config acts as the settings `base` layer when it is an object. */
function baseOf(config) {
    if (config === undefined || config === null) return undefined;
    if (typeof config !== "object" || Array.isArray(config)) return undefined;
    const keys = Object.keys(config);
    if (keys.length === 0) return undefined;
    return config;
}

export function apply(ctx, config) {
    // The settings namespace is what puts this plugin's card into
    // 设置 → 插件 → 插件配置. Optional: a deployment without a settings provider
    // simply keeps the card out of the surface and the browser defaults on.
    // A row-level `config:` in cordis.patch.yml becomes the `base` layer, so a
    // profile can pin defaults that the user document then overrides.
    ctx.inject(["settings"], (settingsCtx) => {
        settingsCtx.settings.register(SETTINGS_NAMESPACE, createSettingsSchema(), {
            ...(baseOf(config) === undefined ? {} : { base: baseOf(config) })
        });
    });

    const assets = collectAssets();
    if (assets.size === 0) return;

    const activeStreams = new Set();
    ctx.effect(() => {
        const handler = createHandler(assets, activeStreams);
        const disposers = [...assets.keys()].map((path) => ctx.webServer.register({
            kind: "exact",
            path,
            handler
        }));
        return () => {
            for (const dispose of disposers) dispose();
            for (const stream of activeStreams) stream.destroy();
            activeStreams.clear();
        };
    }, "lianggod-switcher: portrait assets");
}
