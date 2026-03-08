export type GeminiSegmentSuggestion = {
  startSec: number
  endSec: number
  label: string
  confidence?: number
}

export type GeminiAnalysisMeta = {
  totalDurationSec?: number
  lastEndSec?: number
  coverageNotes?: string
}

type GeminiSegmentPayload = {
  segments: GeminiSegmentSuggestion[]
  meta?: GeminiAnalysisMeta
}

export const buildGeminiPrompt = () => {
  return [
    'You are extracting chewing segments from a video.',
    'Analyze the entire video from start to end. Do not stop early.',
    'Return continuous segments that fully cover the video with no gaps.',
    'Return JSON only. No prose, no code fences.',
    '',
    'Output schema:',
    '{"segments":[{"startSec":0.0,"endSec":0.5,"label":"START","confidence":0.8}],"meta":{"totalDurationSec":12.3,"lastEndSec":12.3,"coverageNotes":""}}',
    '',
    'Rules:',
    '- startSec/endSec are seconds (float).',
    '- endSec must be greater than startSec.',
    '- Segments must be contiguous: each startSec equals the previous endSec.',
    '- meta.totalDurationSec should reflect the full video duration you analyzed.',
    '- meta.lastEndSec should be the last segment end time you reached.',
    '- meta.coverageNotes should explain if coverage is incomplete.',
  ].join('\n')
}

const extractJsonBlock = (text: string) => {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  return text.slice(firstBrace, lastBrace + 1)
}

export const parseGeminiSegments = (text: string) => {
  const block = extractJsonBlock(text)
  if (!block) {
    throw new Error('No JSON payload returned by Gemini.')
  }
  const payload = JSON.parse(block) as GeminiSegmentPayload
  if (!payload || !Array.isArray(payload.segments)) {
    throw new Error('Gemini payload missing segments array.')
  }
  return payload
}
