/**
 * xGSD bundle.js
 * generated: 2026-05-11T19:20:05.297Z
 * hash: bb0d64108f537465a3221a044030e2694d73b76efc4dd531a162fda5ec45933b
 * WARNING: this file is generated. Do not edit manually.
 */
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// fixtures/combined/benchmark.js
async function worker(data) {
  console.log("worker");
  if (data && data.show === "env") {
    return process.env;
  }
  console.log(JSON.stringify({ customSignal: true }));
  return data;
}
__name(worker, "worker");
var a = /* @__PURE__ */ __name(async (ctx, next) => {
  console.log("a called");
  await next();
  console.log("a called");
}, "a");
var b = /* @__PURE__ */ __name(async (ctx, next) => {
  console.log("b called");
  await next();
  console.log("b called");
}, "b");
var middleware = /* @__PURE__ */ __name(() => [a, b], "middleware");
export {
  a,
  b,
  worker as default,
  middleware
};
