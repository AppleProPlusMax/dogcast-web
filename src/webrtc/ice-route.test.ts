import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeSignalIce } from './ice-route.ts'

describe('routeSignalIce', () => {
  it('sends a child candidate to the relay and a parent candidate to the viewer', () => {
    assert.equal(routeSignalIce({
      role: 'viewing',
      fromConnId: 'child',
      parentConnId: 'parent',
      childConnIds: ['child'],
    }), 'relay')
    assert.equal(routeSignalIce({
      role: 'viewing',
      fromConnId: 'parent',
      parentConnId: 'parent',
      childConnIds: ['child'],
    }), 'viewer')
  })

  it('does not treat an unknown sender as the upstream viewer', () => {
    assert.equal(routeSignalIce({
      role: 'viewing',
      fromConnId: 'later-child',
      parentConnId: 'parent',
      childConnIds: [],
    }), 'ignore')
  })

  it('keeps publisher candidates on the publishing mesh', () => {
    assert.equal(routeSignalIce({
      role: 'publishing',
      fromConnId: 'viewer',
      parentConnId: null,
      childConnIds: ['viewer'],
    }), 'publish')
  })
})
