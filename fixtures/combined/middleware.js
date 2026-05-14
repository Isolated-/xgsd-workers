export default async function worker() {}

const middlewareA = async (ctx, next) => {
  ctx.state.trace = []

  ctx.state.trace.push('A')
  await next()
  ctx.state.trace.push('A')
}
const middlewareB = async (ctx, next) => {
  ctx.state.trace.push('B')
  await next()
  ctx.state.trace.push('B')
}
const middlewareC = async (ctx, next) => {
  ctx.state.trace.push('C')
  await next()
  ctx.state.trace.push('C')

  ctx.result = ctx.state.trace
}

export const middleware = async () => [middlewareA, middlewareB, middlewareC]
