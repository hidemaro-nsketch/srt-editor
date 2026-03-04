import type { Segment, ValidationIssue } from './types'

export const validateSegments = (
  segments: Segment[],
  labels: string[],
  duration?: number
): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  segments.forEach((segment) => {
    if (!Number.isFinite(segment.startSec) || !Number.isFinite(segment.endSec)) {
      issues.push({
        id: `nan-${segment.id}`,
        message: 'Start/end must be a valid number.',
        segmentId: segment.id,
      })
      return
    }

    if (segment.startSec < 0 || segment.endSec < 0) {
      issues.push({
        id: `negative-${segment.id}`,
        message: 'Start/end cannot be negative.',
        segmentId: segment.id,
      })
    }

    if (segment.startSec >= segment.endSec) {
      issues.push({
        id: `order-${segment.id}`,
        message: 'Start must be earlier than end.',
        segmentId: segment.id,
      })
    }

    if (!segment.label) {
      issues.push({
        id: `label-${segment.id}`,
        message: 'Label is required.',
        segmentId: segment.id,
      })
    } else if (!labels.includes(segment.label)) {
      issues.push({
        id: `label-missing-${segment.id}`,
        message: 'Label does not exist in the label list.',
        segmentId: segment.id,
      })
    }

    if (typeof duration === 'number' && Number.isFinite(duration)) {
      if (segment.startSec > duration || segment.endSec > duration) {
        issues.push({
          id: `range-${segment.id}`,
          message: 'Segment extends beyond media duration.',
          segmentId: segment.id,
        })
      }
    }
  })
  return issues
}
