import axios from 'axios'

export default async function worker(data) {
  const url = 'https://workers-test-api.xgsd.io/json'

  const json = (
    await axios.post(url, {
      convert: {my: 'string'},
    })
  ).data

  return json
}
