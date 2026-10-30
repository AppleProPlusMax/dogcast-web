import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { perViewerBitrateKbps, planVideoBitrate, withVideoBitrate, type VideoEncodeProfile } from './bitrate.ts'

const profile: VideoEncodeProfile = {
  width: 1920,
  height: 1080,
  fps: 60,
  bitrateKbps: 12_000,
  uploadBudgetKbps: 8_000,
  degradation: 'balanced',
}

describe('perViewerBitrateKbps', () => {
  it('splits the upload budget without raising each viewer above its share', () => {
    assert.equal(perViewerBitrateKbps(8_000, 4), 2_000)
    assert.equal(perViewerBitrateKbps(8_000, 1), 8_000)
    assert.equal(perViewerBitrateKbps(24_000, 1), 20_000)
  })
})

describe('planVideoBitrate', () => {
  it('keeps the total of four viewers inside the upload budget', () => {
    const plan = planVideoBitrate(profile, 4)
    assert.equal(plan.ceilingKbps, 2_000)
    assert.equal(plan.targetKbps, 2_000)
    assert.ok(plan.targetKbps * 4 <= profile.uploadBudgetKbps)
  })
})

describe('withVideoBitrate', () => {
  it('puts bandwidth before the first media attribute when the answer has no media c=', () => {
    const sdp = [
      'v=0',
      'c=IN IP4 0.0.0.0',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
      'a=rtpmap:96 VP8/90000',
      'a=rtpmap:97 rtx/90000',
      'a=fmtp:97 apt=96',
      '',
    ].join('\r\n')
    const next = withVideoBitrate(sdp, 8_000, 8_000)
    const video = next.slice(next.indexOf('m=video'))
    const bandwidth = video.indexOf('b=AS:8000')
    const attribute = video.indexOf('a=')
    assert.ok(bandwidth >= 0)
    assert.ok(bandwidth < attribute)
    assert.match(next, /a=fmtp:96 [^\r\n]*x-google-start-bitrate=8000/)
    assert.match(next, /x-google-min-bitrate=300/)
    assert.doesNotMatch(next, /x-google-min-bitrate=2000/)
  })
})
