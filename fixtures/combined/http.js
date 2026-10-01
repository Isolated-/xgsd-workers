import axios from 'axios'

export default async function worker(data) {
  // TODO: broken link needs removing/updating
  const url = 'https://workers-test-api.xgsd.io/hash'

  const json = (
    await axios.post(url, {
      data: 'hello world',
    })
  ).data

  return json
}
