import axios from 'axios'

export default async function worker(data) {
  const url = 'https://workers-test-api.xgsd.io/hash'

  const json = (
    await axios.post(url, {
      data: 'hello world',
    })
  ).data

  return json
}
