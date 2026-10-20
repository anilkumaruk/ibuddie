// Guards api/router.js (see the comment there). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { ROUTES } from "../api/router.js";

const root = path.join(import.meta.dirname, "..");
const routeFiles = fs.readdirSync(path.join(root, "api/_routes")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
const functionFiles = fs.readdirSync(path.join(root, "api")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));

test("every handler in api/_routes is registered, and every route has a file", () => {
  assert.deepEqual(Object.keys(ROUTES).sort(), routeFiles.sort());
});

test("no name is both a routed handler and a standalone function", () => {
  // A standalone api/<name>.js wins over the rewrite, so the routed copy would be dead code.
  for (const name of routeFiles) assert.ok(!functionFiles.includes(name), name);
});

test("only the router and the webhook are Node.js functions", () => {
  const node = functionFiles.filter((f) => !/^export const config = \{ runtime: "edge" \}/m.test(fs.readFileSync(path.join(root, "api", `${f}.js`), "utf8")));
  assert.deepEqual(node.sort(), ["razorpay-webhook", "router"]);
});

test("every /api/<name> the frontend calls exists", () => {
  const known = new Set([...functionFiles, ...routeFiles]);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(jsx?|tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  for (const file of walk(path.join(root, "src"))) {
    for (const [, name] of fs.readFileSync(file, "utf8").matchAll(/["'`]\/api\/([A-Za-z0-9-]+)/g)) {
      assert.ok(known.has(name), `${path.relative(root, file)} calls /api/${name}, which doesn't exist`);
    }
  }
});

test("router resolves each route to a handler function and 404s unknown ones", async () => {
  const { default: handler } = await import("../api/router.js");
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ query: { route: "nope" } }, res);
  assert.equal(res.code, 404);
  await handler({ query: { route: "__proto__" } }, res);
  assert.equal(res.code, 404);
  // Handlers that need no secrets at import time: check they load and are callable.
  for (const name of ["send-otp", "create-subscription", "cancel-subscription", "verify-subscription"]) {
    const mod = await ROUTES[name]();
    assert.equal(typeof mod.default, "function", name);
  }
});
