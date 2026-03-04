const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const padTwo = (value: number) => String(value).padStart(2, '0')
const padThree = (value: number) => String(value).padStart(3, '0')

export const clampSeconds = (value: number, duration?: number) => {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return Math.min(Math.max(value, 0), Math.max(duration, 0))
  }
  return Math.max(value, 0)
}

export const toMilliseconds = (seconds: number) =>
  Math.round(clampSeconds(seconds) * MS_PER_SECOND)

export const formatTimecode = (seconds: number) => {
  const totalMs = toMilliseconds(seconds)
  const totalSeconds = Math.floor(totalMs / MS_PER_SECOND)
  const ms = totalMs % MS_PER_SECOND
  const secondsPart = totalSeconds % SECONDS_PER_MINUTE
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  return `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(secondsPart)},${padThree(ms)}`
}
