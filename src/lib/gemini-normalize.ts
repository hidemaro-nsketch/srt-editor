import type { Segment } from './types'
import type { GeminiSegmentSuggestion } from './gemini-schema'

type NormalizeOptions = {
  labels: string[]
  defaultLabel: string
  minGapSec?: number
}

const sortByTime = (a: Segment, b: Segment) => {
  if (a.startSec === b.startSec) {
    return a.endSec - b.endSec
  }
  return a.startSec - b.startSec
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const normalizeLabel = (label: string, allowed: string[], fallback: string) => {
  if (allowed.includes(label)) {
    return label
  }
  return fallback
}

export const normalizeGeminiSegments = (
  suggestions: GeminiSegmentSuggestion[],
  duration: number | null,
  options: NormalizeOptions
) => {
  const minGap = options.minGapSec ?? 0.001
  const maxDuration = typeof duration === 'number' && Number.isFinite(duration) ? duration : null
  const toSegment = (suggestion: GeminiSegmentSuggestion): Segment => {
    const startRaw = Number.isFinite(suggestion.startSec) ? suggestion.startSec : 0
    const endRaw = Number.isFinite(suggestion.endSec)
      ? suggestion.endSec
      : startRaw + minGap
    const clampedStart = Math.max(0, startRaw)
    const clampedEnd = Math.max(clampedStart + minGap, endRaw)
    const maxStart = maxDuration === null ? clampedStart : Math.max(0, maxDuration - minGap)
    const startSec = maxDuration === null ? clampedStart : clamp(clampedStart, 0, maxStart)
    const endLimit = maxDuration === null ? clampedEnd : clamp(clampedEnd, 0, maxDuration)
    return {
      id: globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `seg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      startSec,
      endSec: Math.max(startSec + minGap, endLimit),
      label: normalizeLabel(suggestion.label, options.labels, options.defaultLabel),
    }
  }

  return suggestions.map(toSegment).sort(sortByTime)
}
