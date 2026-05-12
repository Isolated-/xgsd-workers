# Workers.js

[![Version](https://img.shields.io/npm/v/@xgsd/workers.svg)](https://npmjs.org/package/@xgsd/workers)  
[![CI & Release](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml/badge.svg)](https://github.com/Isolated-/xgsd-workers/actions/workflows/release.yml)

---

**Workers.js** runs your code in a container that handle most failures for you.

## Install

Install this package with:

```bash
yarn add @xgsd/workers
```

---

## Usage

A **Worker** is a simple async function, usually exported from `worker.js`:

```javascript
import axios from 'axios'

export default async function worker(data) {
  const url = 'https://timeapi.io/api/Time/current/zone?timeZone=Europe/London'

  const json = (await axios.get(url)).data
  return json
}
```

It also contains your middleware.

Run a worker:

```javascript
import {createTransport} from '@xgsd/workers'

const transport = createTransport({
  entry: './worker.js',
})

// how you expose the handler is up to you
// this example assumes Express/Koa-style callback
async function callback(req, res) {
  return transport({
    data: req.body,
    env: {MY_VAR: 'hello world'},
  })
}
```

A **Worker** runs inside its own isolated process, giving each task a guarded execution environment. This provides strong separation between workloads and helps contain potentially unsafe or unstable code.

It also makes local development and prototyping much simpler — especially for solo developers or home setups — by giving you a predictable environment that can be brought up quickly without heavy infrastructure.

---

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

---

## Benchmarks

Run benchmarks with:

```bash
node benchmarks/concurrency.js
```

Results are saved to `benchmarks/results`.

---

## Versioning

Workers follows Semantic Versioning (SemVer).

- Patch releases (`1.0.x`) contain fixes, documentation updates, and non-breaking improvements.
- Minor releases (`1.x.0`) add new functionality without breaking existing APIs.
- Major releases (`x.0.0`) contain breaking changes or behavioural changes to public APIs.

Pre-release versions such as `1.0.0-beta.0` are used during stabilisation phases before a stable release.

Once a stable major version is released, breaking changes will only happen through a new major release.

---

## Stability

Workers is currently in active development, with the API stabilising towards `v1.0.0`.

Pre-release versions such as `1.0.0-beta.x` are used to validate behaviour, improve documentation, and strengthen test coverage before the first stable release.

The goal for `v1` is to provide a predictable and stable execution contract for running isolated Node.js workloads. Once `v1.0.0` is released, breaking changes to public APIs will only happen through new major versions following Semantic Versioning (SemVer).

Internal implementation details may continue to evolve over time, but stability and backward compatibility of the public API will remain a priority.

---

## Contributing

Issues, bug reports, and pull requests are welcome.

If you encounter a bug, please include:

- reproduction steps
- expected behaviour
- actual behaviour
- Node.js version
- operating system
- relevant logs or stack traces

For larger changes or feature ideas, open an issue first so the direction can be discussed before implementation work begins.

The goal of Workers is to keep execution predictable, simple, and easy to reason about — contributions should aim to preserve those properties.

---

## License

MIT © Michael Palmer

You are free to use, modify, distribute, and build on this project, including for commercial use, provided the original copyright and license notice are preserved.

---

## Documentation

Read the [**Documentation**](https://isolated-.github.io/xgsd-userdocs/labs/Workers/overview).
