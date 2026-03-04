import type { Segment } from './types'
import { formatTimecode } from './timecode'

const sortByTime = (a: Segment, b: Segment) => {
  if (a.startSec === b.startSec) {
    return a.endSec - b.endSec
  }
  return a.startSec - b.startSec
}

export const formatSrt = (segments: Segment[]) => {
  const sorted = [...segments].sort(sortByTime)
  return (
    sorted
      .map((segment, index) => {
        const start = formatTimecode(segment.startSec)
        const end = formatTimecode(segment.endSec)
        return `${index + 1}\n${start} --> ${end}\n<b>${segment.label}</b>\n`
      })
      .join('\n') +
    '\n'
  )
}
