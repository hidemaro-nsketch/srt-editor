import type { GeminiSegmentSuggestion } from './gemini-schema'

export type GeminiClientResult = {
  requestId?: string
  segments: GeminiSegmentSuggestion[]
  meta?: {
    totalDurationSec?: number
    lastEndSec?: number
    coverageNotes?: string
  }
}

export type GeminiClientError = {
  code: 'RATE_LIMITED' | 'TIMEOUT' | 'INVALID_OUTPUT' | 'UNKNOWN'
  message: string
  requestId?: string
}

export type GeminiClientResponse =
  | { ok: true; data: GeminiClientResult }
  | { ok: false; error: GeminiClientError }

export const analyzeVideo = async (file: File, prompt: string) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('prompt', prompt)

  const response = await fetch('/api/gemini/analyze', {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json()) as GeminiClientResponse

  if (!response.ok || !payload.ok) {
    if (!payload.ok) {
      throw payload.error
    }
    throw {
      code: 'UNKNOWN',
      message: 'Unexpected server error.',
    } satisfies GeminiClientError
  }

  return payload.data
}
