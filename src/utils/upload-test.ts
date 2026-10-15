import { apiUrl } from '@/api/env'
import { ApiError, toApiError } from '@/api/errors'

const WARMUP_BYTES = 256 * 1024
const MEASURE_MS = 5_000
const MIN_CHUNK = 256 * 1024
const MAX_CHUNK = 8 * 1024 * 1024
const TARGET_CHUNK_MS = 700

export interface UploadSample {
  elapsedMs: number
  mbps: number
}

export function formatMbps(value: number) {
  if (!Number.isFinite(value) || value < 10) return value.toFixed(1)
  return Math.round(value).toString()
}

export async function measureSustainedUpload(options: {
  token: string | null
  onSample?: (sample: UploadSample) => void
}) {
  await sendChunk(WARMUP_BYTES, options.token)

  let chunkBytes = 512 * 1024
  let measuredMs = 0
  let counted = 0
  const buckets: number[] = []

  while (measuredMs < MEASURE_MS) {
    let result: { elapsedMs: number }
    try {
      result = await sendChunk(chunkBytes, options.token)
    } catch (error) {
      if (measuredMs >= 1_500 && error instanceof ApiError && error.status === 429) break
      throw error
    }
    const mbps = (chunkBytes * 8) / (result.elapsedMs / 1000) / 1_000_000
    buckets.push(mbps)
    counted += chunkBytes
    measuredMs += result.elapsedMs
    options.onSample?.({ elapsedMs: Math.min(measuredMs, MEASURE_MS), mbps: median(buckets) })
    const scaled = Math.round(chunkBytes * (TARGET_CHUNK_MS / result.elapsedMs))
    chunkBytes = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, scaled))
  }

  return { mbps: median(buckets), bytes: counted, elapsedMs: measuredMs }
}

async function sendChunk(bytes: number, token: string | null) {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/octet-stream',
  })
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const started = performance.now()
  let response: Response
  try {
    response = await fetch(apiUrl('/api/speed-test'), {
      method: 'POST',
      headers,
      body: new Uint8Array(bytes),
      credentials: 'include',
    })
  } catch {
    throw new ApiError('NETWORK', '连不上服务器', 0)
  }
  const elapsedMs = Math.max(performance.now() - started, 1)
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      throw new ApiError('INTERNAL', '服务器返回了无法识别的内容', response.status)
    }
  }
  if (!response.ok) throw toApiError(data, response.status)
  return { elapsedMs }
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}
