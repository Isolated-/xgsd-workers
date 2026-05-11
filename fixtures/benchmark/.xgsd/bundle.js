/**
 * xGSD bundle.js
 * generated: 2026-05-11T09:50:43.453Z
 * hash: eb1fd6540f641edfb9d8e028e3f17b6e6f183bc3b140f81e894fc81751f08641
 * WARNING: this file is generated. Do not edit manually.
 */
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// fixtures/benchmark/worker.js
async function worker(data) {
  console.log("worker");
  if (data && data.show === "env") {
    return process.env;
  }
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
