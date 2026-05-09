# @xgsd/workers

[![Version](https://img.shields.io/npm/v/@xgsd/workers.svg)](https://npmjs.org/package/@xgsd/workers)  
[![CI & Release](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml/badge.svg)](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml)

This runtime is designed as a simplified alternative to the full xGSD engine — focusing on fast execution, low memory usage, and deterministic behaviour.

## Documentation

Read the [**Documentation**](https://isolated-.github.io/xgsd-userdocs/labs/Workers/overview).

## Install

Install this package with:

```bash
yarn add @xgsd/workers
```

## Usage

```javascript
export default async function (data) {
  const url = data.url ?? 'https://timeapi.io/api/Time/current/zone?timeZone=Europe/London'

  const res = await fetch(url)
  const json = await res.json()

  return json
}
```

Run a worker:

```javascript
import {createHandler} from '@xgsd/workers'

const config = getWorkerConfig()
const handler = createHandler(config)

// inside your transport (e.g. Express route):
async function callback(req, res) {
  const data = req.body

  const result = await handler({
    data,
    env: {
      // env vars
    },
    cwd: 'path/to/worker',
  })
}
```

## Testing

TBD
