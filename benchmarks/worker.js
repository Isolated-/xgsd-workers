const createLargeObject = (count = 10000) => {
  const items = []

  for (let i = 0; i < count; i++) {
    items.push({
      id: i,
      name: `item-${i}`,
      description: 'x'.repeat(100),
      nested: {
        active: true,
        tags: ['a', 'b', 'c'],
      },
    })
  }

  return {
    generatedAt: Date.now(),
    items,
  }
}

export default async function worker(data) {
  return createLargeObject(5000)
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
