import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldRefreshOnUnauthorized } from './auth-retry.ts'

describe('shouldRefreshOnUnauthorized', () => {
  it('refreshes an account session and leaves a watch token alone', () => {
    assert.equal(shouldRefreshOnUnauthorized({ allowRefresh: true, auth: true, guest: false }), true)
    assert.equal(shouldRefreshOnUnauthorized({ allowRefresh: true, auth: true, guest: true }), false)
    assert.equal(shouldRefreshOnUnauthorized({ allowRefresh: false, auth: true, guest: false }), false)
    assert.equal(shouldRefreshOnUnauthorized({ allowRefresh: true, auth: false, guest: false }), false)
  })
})
