/**
 * createTransport is the public API for Workers.js.
 *
 * These tests define the v2 application contract and document the
 * expected behaviour exposed to consumers.
 *
 * If these tests fail, a breaking change has likely been introduced
 * into the public API and should be evaluated accordingly.
 *
 * V2 focuses on reducing assumptions around execution models,
 * supporting both short-lived and long-running workers through
 * explicit lifecycle management.
 *
 * @since v2
 */
import {describe, expect, test} from 'vitest'
import {createTestTransport, createTestTransportV2} from './util.js'

describe('Workers Public API (v2)', () => {
  test('long running processes are now supported', async () => {
    const transport = createTestTransportV2('benchmark.js', {
      limits: {
        ttl: 'none',
      },
      stream: 'none',
    })

    const res = await transport.execute()
    expect(res.ok).toBeTruthy()
  })

  test('lifecycle management is parent owned', async () => {
    const transport = createTestTransportV2('benchmark.js', {
      limits: {
        ttl: 'none',
      },
    })

    ;(async () => {
      await transport.execute()
      expect(true).toBeFalsy()
    })()

    transport.abort()
  })
})
