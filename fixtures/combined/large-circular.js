const createLargeObject = () => {
  const items = []

  for (let i = 0; i < 10000; i++) {
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

export default function () {
  const data = createLargeObject()

  // circular reference
  data.self = data

  return data
}
