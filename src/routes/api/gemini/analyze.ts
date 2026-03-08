import { createFileRoute } from '@tanstack/react-router'
import { parseGeminiSegments } from '../../../lib/gemini-schema'

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const GEMINI_UPLOAD_ENDPOINT = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const GEMINI_FILES_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/files'
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/mpeg',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/3gpp',
])

const buildRequestId = () =>
  globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`

const isRetryable = (status: number) => status === 408 || status === 429 || status >= 500

const fetchWithRetry = async (input: RequestInfo, init: RequestInit, maxAttempts = 3) => {
  let attempt = 0
  let lastError: unknown = null
  while (attempt < maxAttempts) {
    try {
      const response = await fetch(input, init)
      const retryAfter = response.headers.get('retry-after')
      if (!isRetryable(response.status)) {
        return response
      }
      lastError = response
      if (retryAfter) {
        const delay = Number(retryAfter)
        if (Number.isFinite(delay) && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay * 1000))
        }
      }
    } catch (error) {
      lastError = error
    }
    attempt += 1
    const backoff = Math.min(800 * 2 ** (attempt - 1), 4000)
    await new Promise((resolve) => setTimeout(resolve, backoff + Math.random() * 200))
  }
  if (lastError instanceof Response) {
    return lastError
  }
  throw lastError
}

const uploadVideoFile = async (file: File, apiKey: string, debug: boolean) => {
  if (debug) {
    console.log('[gemini] upload start', {
      name: file.name,
      size: file.size,
      type: file.type,
    })
  }
  const startResponse = await fetchWithRetry(`${GEMINI_UPLOAD_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': file.type || 'application/octet-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  })

  if (!startResponse.ok) {
    if (debug) {
      const text = await startResponse.text()
      console.log('[gemini] upload start error', startResponse.status, text.slice(0, 2000))
    }
    throw new Error(`Gemini upload start failed (${startResponse.status})`)
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini upload URL missing.')
  }

  const uploadResponse = await fetchWithRetry(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(file.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file.stream(),
    duplex: 'half',
  } as RequestInit)

  if (!uploadResponse.ok) {
    if (debug) {
      const text = await uploadResponse.text()
      console.log('[gemini] upload error', uploadResponse.status, text.slice(0, 2000))
    }
    throw new Error(`Gemini upload failed (${uploadResponse.status})`)
  }

  const uploaded = (await uploadResponse.json()) as { file?: { uri?: string; mimeType?: string } }
  if (debug) {
    console.log('[gemini] upload complete', uploaded)
  }
  if (!uploaded.file?.uri) {
    throw new Error('Gemini upload response missing file uri.')
  }

  const fileUri = uploaded.file.uri
  const fileId = fileUri.split('/').pop()
  if (!fileId) {
    throw new Error('Gemini upload response missing file id.')
  }

  const waitForActive = async () => {
    const maxAttempts = 10
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusResponse = await fetchWithRetry(
        `${GEMINI_FILES_ENDPOINT}/${fileId}?key=${apiKey}`,
        { method: 'GET' }
      )
      if (!statusResponse.ok) {
        if (debug) {
          const text = await statusResponse.text()
          console.log('[gemini] file status error', statusResponse.status, text.slice(0, 2000))
        }
        await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 200))
        continue
      }
      const statusPayload = (await statusResponse.json()) as { state?: string }
      if (debug) {
        console.log('[gemini] file status', statusPayload)
      }
      if (statusPayload.state === 'ACTIVE') {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 300))
    }
    throw new Error('Gemini file did not become ACTIVE in time.')
  }

  await waitForActive()

  return {
    uri: fileUri,
    mimeType: uploaded.file.mimeType ?? file.type ?? 'application/octet-stream',
  }
}

export const Route = createFileRoute('/api/gemini/analyze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = buildRequestId()
        try {
          const form = await request.formData()
          const file = form.get('file')
          const prompt = String(form.get('prompt') ?? '')
          if (!(file instanceof File)) {
            return Response.json(
              { ok: false, error: { code: 'INVALID_OUTPUT', message: '`file` is required', requestId } },
              { status: 400 }
            )
          }
          if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
            return Response.json(
              {
                ok: false,
                error: { code: 'INVALID_OUTPUT', message: 'Unsupported video type.', requestId },
              },
              { status: 400 }
            )
          }
          if (file.size > MAX_UPLOAD_BYTES) {
            return Response.json(
              {
                ok: false,
                error: { code: 'INVALID_OUTPUT', message: 'Video file is too large.', requestId },
              },
              { status: 413 }
            )
          }
          if (!prompt.trim()) {
            return Response.json(
              { ok: false, error: { code: 'INVALID_OUTPUT', message: '`prompt` is required', requestId } },
              { status: 400 }
            )
          }

          const apiKey = process.env.GEMINI_API_KEY
          const debug = true
          if (!apiKey) {
            return Response.json(
              { ok: false, error: { code: 'UNKNOWN', message: 'Missing GEMINI_API_KEY', requestId } },
              { status: 500 }
            )
          }

          const uploaded = await uploadVideoFile(file, apiKey, debug)
          const body = JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    fileData: {
                      fileUri: uploaded.uri,
                      mimeType: uploaded.mimeType,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          })

          if (debug) {
            console.log('[gemini] generateContent request', {
              fileUri: uploaded.uri,
              mimeType: uploaded.mimeType,
              promptLength: prompt.length,
            })
          }
          const response = await fetchWithRetry(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body,
          })

          if (!response.ok) {
            if (debug) {
              const text = await response.text()
              console.log('[gemini] generateContent error', response.status, text.slice(0, 2000))
            }
            const code = response.status === 429 ? 'RATE_LIMITED' : response.status === 408 ? 'TIMEOUT' : 'UNKNOWN'
            return Response.json(
              { ok: false, error: { code, message: `Gemini API error (${response.status})`, requestId } },
              { status: response.status }
            )
          }

          const payload = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          }
          const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          const parsed = parseGeminiSegments(text)
          return Response.json({
            ok: true,
            data: { requestId, segments: parsed.segments, meta: parsed.meta },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          return Response.json(
            { ok: false, error: { code: 'UNKNOWN', message, requestId } },
            { status: 500 }
          )
        }
      },
    },
  },
})
