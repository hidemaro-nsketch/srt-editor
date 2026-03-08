import type { Segment } from './types'

const TIMECODE_PATTERN = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/

export const parseTimecode = (timecode: string): number => {
  const match = timecode.match(TIMECODE_PATTERN)
  if (!match) {
    return 0
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const ms = Number(match[4])
  return hours * 3600 + minutes * 60 + seconds + ms / 1000
}

const stripHtmlTags = (text: string): string => text.replace(/<[^>]*>/g, '').trim()

const createId = (): string => {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID()
  }
  return `seg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const parseSrt = (srtText: string): Segment[] => {
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const blocks = normalized.split(/\n\n+/)
  const segments: Segment[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length < 3) {
      continue
    }

    const timeLine = lines[1]
    const arrowMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    )
    if (!arrowMatch) {
      continue
    }

    const startSec = parseTimecode(arrowMatch[1])
    const endSec = parseTimecode(arrowMatch[2])
    const label = stripHtmlTags(lines.slice(2).join(' '))

    segments.push({
      id: createId(),
      startSec,
      endSec,
      label,
    })
  }

  return segments
}
