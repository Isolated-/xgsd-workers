const createLargeObject = () => {
  const items = []

  for (let i = 0; i < 2000; i++) {
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

export default async () => {
  const data = createLargeObject()

  // circular reference
  data.self = data

  return data
}

const transformer = async (ctx, next) => {
  await next()

  ctx.result = {fixed: true}
}

export const middleware = async () => [transformer]
