# @xgsd/workers

[![Version](https://img.shields.io/npm/v/@xgsd/workers.svg)](https://npmjs.org/package/@xgsd/workers)  
[![CI & Release](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml/badge.svg)](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml)

Make Node.js more predictable and fail-safe with **Workers**.

This is a simplified alternative to the full xGSD runtime — focusing on fast execution, low memory usage, and deterministic behaviour.

## Install

Install this package with:

```bash
yarn add @xgsd/workers
```

## Usage

A **Worker** is a simple async function:

```javascript
export default async function worker(data) {
  const url = data.url ?? 'https://timeapi.io/api/Time/current/zone?timeZone=Europe/London'

  const res = await fetch(url)
  const json = await res.json()

  return json
}
```

It also contains your middleware:

```javascript
export default async function worker(data) {
  // ...
}

const logger = (ctx, next) => {
  console.log('before')
  await next()
  console.log('after')
}
```

Run a worker:

```javascript
import {createHandler} from '@xgsd/workers'

const handler = createHandler({
  // you can provide this in handler()
  // depending on your app
  cwd: process.cwd(),

  // by default a signals.jsonl is created
  // if you're developing try:
  process: process.stdout,
})

// how you expose the handler is up to you
// this example assumes Express/Koa-style callback
async function callback(req, res) {
  return handler({
    data: req.body,
  })
}
```

A **Worker** runs inside its own isolated process, giving each task a guarded execution environment. This provides strong separation between workloads and helps contain potentially unsafe or unstable code.

It also makes local development and prototyping much simpler — especially for solo developers or home setups — by giving you a predictable environment that can be brought up quickly without heavy infrastructure.

## Testing

Setup fixtures:

```bash
chmod +x ./install.sh
./install.sh
```

Run all tests with:

```bash
yarn test
```

## Documentation

Read the [**Documentation**](https://isolated-.github.io/xgsd-userdocs/labs/Workers/overview).
