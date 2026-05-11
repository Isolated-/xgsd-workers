# @xgsd/engine

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)  
[![Version](https://img.shields.io/npm/v/@xgsd/engine.svg)](https://npmjs.org/package/@xgsd/engine)  
[![CI & Release](https://github.com/Isolated-/xgsd-engine/actions/workflows/release.yml/badge.svg)](https://github.com/Isolated-/xgsd-engine/actions/workflows/release.yml)

A small, deterministic execution engine built from pure functions.

## Overview

`@xgsd/engine` provides the core execution primitives used by xGSD.

It is:

- framework-agnostic
- side-effect free
- designed to remain stable over time
- pure JavaScript

It focuses only on **execution logic**, not runtime orchestration or system design.

---

## Install

```bash
npm install @xgsd/engine
```

or

```bash
yarn add @xgsd/engine
```

---

## Design principles

### Pure functions

All functionality is implemented as pure, composable functions:

- `retry`
- `execute`
- `timeout`
- `runWithConcurrency`

Each function:

- takes explicit inputs
- returns explicit outputs
- avoids hidden state
- is easy to test

---

### Deterministic execution

Given the same inputs, functions behave the same way every time.

Side effects (logging, events, persistence, etc.) are intentionally excluded.

---

### No runtime awareness

The engine does not depend on or understand any external system or environment.

It does not know about:

- plugins or extensions
- application state
- event systems
- logging systems
- orchestration layers

It only operates on inputs and outputs.

---

## Core APIs

### retry

Retries a function with optional timeout, backoff, and hooks.

```ts
retry(data, fn, retries, options)
```

---

### execute

Executes a single unit of work and returns a structured result.

```ts
execute(data, fn, ms?)
```

---

### timeout

Runs a task with a time limit.

```ts
timeout(ms, task)
```

---

### runWithConcurrency

Runs multiple tasks with a concurrency limit.

```ts
runWithConcurrency(items, limit, worker)
```

---

## What this package is NOT

This package is not:

- a framework
- a runtime
- a plugin system
- an event system
- an application layer

It is intentionally minimal and focused only on execution primitives.

---

## Test

Run the unit test suite:

```bash
npm test
```

or

```bash
yarn test
```

---

## Intended usage

This package is designed for:

- `@xgsd/runtime`
- workflow engines
- orchestration layers
- CLI or API adapters

It is not intended for direct end-user application logic.

Some utilities (such as `runWithConcurrency()` or `timeout()`) may be useful in isolation, but they are exposed primarily to support higher-level orchestration rather than as a general-purpose utility library.

---

## Mental model

Think of `@xgsd/engine` as:

> the execution rules of xGSD

It defines how execution behaves, not how systems are structured.

---

## Relationship to runtime

- engine → execution logic
- runtime → system orchestration
- cli → user interface layer

---

## Summary

`@xgsd/engine` is a minimal execution core designed to be:

- predictable
- composable
- dependency-free
- runtime-agnostic

It forms the foundation of xGSD’s execution model without imposing system structure.
