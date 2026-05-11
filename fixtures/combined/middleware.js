export default async function worker() {}

const middlewareA = async (ctx, next) => {
  ctx.trace.push('A')
  await next()
  ctx.trace.push('A')
}
const middlewareB = async (ctx, next) => {
  ctx.trace.push('B')
  await next()
  ctx.trace.push('B')
}
const middlewareC = async (ctx, next) => {
  ctx.trace.push('C')
  await next()
  ctx.trace.push('C')

  ctx.result = ctx.trace
}

export const middleware = () => [middlewareA, middlewareB, middlewareC]
