import axios from 'axios'

export default async function worker(data) {
  const url = 'https://timeapi.io/api/Time/current/zone?timeZone=Europe/London'

  const json = (await axios.get(url)).data
  return json
}
