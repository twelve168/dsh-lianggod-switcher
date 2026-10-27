/**
 * Host-half verification for host.js.
 *
 * The host half owns the portrait routes, so this spins up the real handler on a
 * real http server on an ephemeral port and drives it with fetch: route table,
 * content type, byte-for-byte body, ETag/304, 404 and 405. It also asserts that
 * the fiber's disposer unregisters every route.
 *
 *   node verify-host.cjs
 */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

/** Repository root (this file lives in test/). */
const here = join(__dirname, "..");

async function main() {
    const host = await import(pathToFileURL(join(here, "host.js")).href);

    assert.equal(host.name, "lianggod-switcher");
    assert.deepEqual([...host.inject], ["webServer"]);
    assert.equal(typeof host.apply, "function");
    assert.equal(typeof host.Config["~standard"].validate, "function");

    const routes = [];
    const disposers = [];
    let handler = null;
    const settingsRegistrations = [];
    const settingsService = {
        register(ns, schema, options) {
            settingsRegistrations.push({ ns, schema, options });
            return { get() {}, watch() { return () => {}; }, update() {}, replace() {} };
        }
    };
    const ctx = {
        webServer: {
            register(route) {
                routes.push(route);
                handler = route.handler;
                const dispose = () => { routes.splice(routes.indexOf(route), 1); };
                return dispose;
            }
        },
        inject(deps, callback) {
            const available = { settings: settingsService };
            const picked = deps.filter((dep) => dep in available);
            if (picked.length !== deps.length) return () => {};
            return callback({ get: (name) => available[name], ...available });
        },
        effect(factory) {
            const dispose = factory();
            disposers.push(dispose);
            return () => {};
        }
    };

    host.apply(ctx);

    // ── settings namespace (what puts the card in 插件配置) ────────────────
    assert.equal(settingsRegistrations.length, 1, "registers exactly one settings namespace");
    const { ns, schema } = settingsRegistrations[0];
    assert.equal(ns, "lianggod-switcher");
    assert.ok(/^[a-z][a-z0-9-]*$/.test(ns), "namespace must satisfy the host pattern");
    assert.equal(ns, host.SETTINGS_NAMESPACE, "exported constant is the registered string");
    assert.equal(typeof schema, "function", "the settings service calls the schema");

    // Defaults, partial sections, and rejection of junk.
    assert.deepEqual({ ...schema() }, { background: true, portrait: true, persistent: true });
    assert.deepEqual({ ...schema(undefined) }, { background: true, portrait: true, persistent: true });
    assert.deepEqual({ ...schema({ background: false }) }, { background: false, portrait: true, persistent: true });
    assert.deepEqual(
        { ...schema({ background: false, portrait: false, persistent: false }) },
        { background: false, portrait: false, persistent: false }
    );
    assert.throws(() => schema({ portrait: "yes" }), /expected boolean/);
    assert.throws(() => schema({ persistent: 0 }), /expected boolean/);
    assert.throws(() => schema([]), /must be an object/);

    // Envelope the descriptor wire carries: schemastery's { uid, refs } graph.
    const envelope = schema.toJSON();
    assert.equal(typeof envelope.uid, "number");
    assert.equal(envelope.refs[envelope.uid].type, "object");
    assert.deepEqual({ ...envelope.refs[envelope.uid].dict }, { background: 1, portrait: 2, persistent: 3 });
    assert.equal(envelope.refs[1].type, "boolean");
    assert.equal(envelope.refs[1].meta.default, true);
    assert.equal(envelope.refs[3].meta.default, true, "the third switch defaults to persistent");
    assert.equal(JSON.parse(JSON.stringify(envelope)).uid, envelope.uid, "envelope is JSON-safe for the wire");

    assert.equal(routes.length, 24, "one exact route per portrait anchor");
    assert.equal(typeof handler, "function");
    for (const route of routes) {
        assert.equal(route.kind, "exact", "duplicate paths throw, so every file gets its own exact route");
        assert.ok(route.path.startsWith("/plugins/dsh-lianggod-switcher/assets/portrait/"), route.path);
        assert.ok(route.path.endsWith(".webp"), route.path);
    }
    assert.equal(new Set(routes.map((route) => route.path)).size, 24, "no duplicate paths");

    // ── drive the real handler ──────────────────────────────────────────────
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const first = routes.find((route) => route.path.endsWith("stage-30.webp"));
        const response = await fetch(base + first.path);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/webp");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        const body = Buffer.from(await response.arrayBuffer());
        const onDisk = readFileSync(join(here, "assets", "portrait", "stage-30.webp"));
        assert.equal(body.length, onDisk.length, "full body served");
        assert.ok(body.equals(onDisk), "bytes are byte-identical to disk");
        assert.equal(body.subarray(0, 4).toString("latin1"), "RIFF");
        assert.equal(body.subarray(8, 12).toString("latin1"), "WEBP");
        assert.ok(Number(response.headers.get("content-length")) > 0);

        const etag = response.headers.get("etag");
        assert.ok(etag !== null && etag.startsWith("W/"), "weak ETag advertised");
        const revalidated = await fetch(base + first.path, { headers: { "If-None-Match": etag } });
        assert.equal(revalidated.status, 304, "revalidation short-circuits");
        await revalidated.arrayBuffer();

        const missing = await fetch(`${base}/plugins/dsh-lianggod-switcher/assets/portrait/nope.webp`);
        assert.equal(missing.status, 404);
        await missing.arrayBuffer();

        const wrongMethod = await fetch(`${base}${first.path}`, { method: "POST" });
        assert.equal(wrongMethod.status, 405);
        assert.equal(wrongMethod.headers.get("allow"), "GET, HEAD");
        await wrongMethod.arrayBuffer();

        const head = await fetch(`${base}${first.path}`, { method: "HEAD" });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get("content-type"), "image/webp");
        await head.arrayBuffer();
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    // ── teardown ────────────────────────────────────────────────────────────
    assert.equal(disposers.length, 1, "one fiber effect owns the routes");
    for (const dispose of disposers) dispose();
    assert.equal(routes.length, 0, "every route unregistered on dispose");

    // ── row-level config becomes the settings `base` layer ─────────────────
    const baseCalls = [];
    const baseCtx = {
        webServer: { register() { return () => {}; } },
        inject(deps, callback) {
            if (!deps.includes("settings")) return () => {};
            return callback({
                settings: {
                    register(ns, schema, options) {
                        baseCalls.push({ ns, schema, options });
                        return {};
                    }
                }
            });
        },
        effect(factory) { factory(); return () => {}; }
    };
    host.apply(baseCtx, { background: false });
    host.apply(baseCtx, {});
    host.apply(baseCtx);
    assert.equal(baseCalls.length, 3, "each apply registers the namespace once");
    assert.deepEqual({ ...baseCalls[0].options.base }, { background: false }, "config pins the base layer");
    assert.equal(baseCalls[1].options.base, undefined, "an empty config carries no base");
    assert.equal(baseCalls[2].options.base, undefined, "no config carries no base");

    console.log("ok — host half verified");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
