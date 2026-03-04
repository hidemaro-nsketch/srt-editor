export type Segment = {
  id: string
  startSec: number
  endSec: number
  label: string
}

export type ValidationIssue = {
  id: string
  message: string
  segmentId?: string
}
