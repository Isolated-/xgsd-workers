export default async function worker(data) {
  console.log('worker')

  console.log(JSON.stringify({customSignal: true}))

  return data
}

export const a = async (ctx, next) => {
  console.log('a called')
  await next()
  console.log('a called')
}

export const b = async (ctx, next) => {
  console.log('b called')
  await next()
  console.log('b called')
}

export const middleware = () => [a, b]
