import axios from 'axios'

export default async function web() {
  // return values must be serialisable
  // axios.get should always be a function
  return typeof axios.get
}
