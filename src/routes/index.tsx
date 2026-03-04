import { createFileRoute } from '@tanstack/react-router'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from 'react'
import { formatSrt } from '../lib/srt-format.ts'
import { formatTimecode } from '../lib/timecode.ts'
import type { Segment, ValidationIssue } from '../lib/types'
import { validateSegments } from '../lib/segment-validate.ts'

export const Route = createFileRoute('/')({ component: SrtLabelingPage })

const DEFAULT_LABELS = ['START', 'x', 'END']

const createId = () => {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID()
  }
  return `seg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const createSegment = (seedLabel: string, startSec: number, endSec: number): Segment => ({
  id: createId(),
  startSec,
  endSec,
  label: seedLabel,
})

function SrtLabelingPage() {
  const mediaRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const laneRef = useRef<HTMLDivElement | null>(null)
  const playheadDragRef = useRef<{
    startX: number
    duration: number
    width: number
  } | null>(null)
  const dragRef = useRef<
    | {
        id: string
        type: 'move' | 'start' | 'end'
        startX: number
        startStart: number
        startEnd: number
        duration: number
        width: number
      }
    | null
  >(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaName, setMediaName] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS)
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(() =>
    segments[0]?.id ?? null
  )
  const [pixelsPerSecond, setPixelsPerSecond] = useState(100)

  useEffect(() => {
    const media = mediaRef.current
    if (!media) {
      return undefined
    }

    const updateCurrentTime = () => {
      setCurrentTime(media.currentTime || 0)
    }

    const updateDuration = () => {
      const nextDuration = Number.isFinite(media.duration)
        ? media.duration
        : null
      setDuration(nextDuration)
    }

    const stopRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    const tick = () => {
      updateCurrentTime()
      rafRef.current = requestAnimationFrame(tick)
    }

    const handlePlay = () => {
      setIsPlaying(true)
      stopRaf()
      rafRef.current = requestAnimationFrame(tick)
    }

    const handlePause = () => {
      setIsPlaying(false)
      stopRaf()
      updateCurrentTime()
    }

    const handleSeeked = () => {
      updateCurrentTime()
    }

    media.addEventListener('loadedmetadata', updateDuration)
    media.addEventListener('durationchange', updateDuration)
    media.addEventListener('timeupdate', updateCurrentTime)
    media.addEventListener('seeking', updateCurrentTime)
    media.addEventListener('seeked', handleSeeked)
    media.addEventListener('play', handlePlay)
    media.addEventListener('pause', handlePause)
    media.addEventListener('ended', handlePause)

    return () => {
      stopRaf()
      media.removeEventListener('loadedmetadata', updateDuration)
      media.removeEventListener('durationchange', updateDuration)
      media.removeEventListener('timeupdate', updateCurrentTime)
      media.removeEventListener('seeking', updateCurrentTime)
      media.removeEventListener('seeked', handleSeeked)
      media.removeEventListener('play', handlePlay)
      media.removeEventListener('pause', handlePause)
      media.removeEventListener('ended', handlePause)
    }
  }, [mediaUrl])

  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl)
      }
    }
  }, [mediaUrl])

  const activeSegmentId = useMemo(() => {
    if (!isPlaying && selectedSegmentId) {
      return selectedSegmentId
    }
    return segments.find(
      (segment) => currentTime >= segment.startSec && currentTime <= segment.endSec
    )?.id
  }, [currentTime, isPlaying, segments, selectedSegmentId])

  const issues: ValidationIssue[] = useMemo(
    () => validateSegments(segments, labels, duration ?? undefined),
    [segments, labels, duration]
  )

  const canExport = issues.length === 0

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId]
  )
  const activeSegment = useMemo(
    () => segments.find((segment) => segment.id === activeSegmentId) ?? null,
    [segments, activeSegmentId]
  )
  const inspectorSegment = activeSegment ?? selectedSegment

  const timelineTicks = useMemo(() => {
    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      return []
    }
    const step = 5
    const count = Math.floor(duration / step)
    return Array.from({ length: count + 1 }, (_, index) => index * step)
  }, [duration])

  const timelineWidth = useMemo(() => {
    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      return 0
    }
    return duration * pixelsPerSecond
  }, [duration, pixelsPerSecond])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl)
    }
    const url = URL.createObjectURL(file)
    setMediaUrl(url)
    setMediaName(file.name)
  }

  const handleLoadClick = () => {
    fileInputRef.current?.click()
  }

  const handleClearMedia = () => {
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl)
    }
    if (mediaRef.current) {
      mediaRef.current.pause()
      mediaRef.current.currentTime = 0
    }
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(null)
    setMediaUrl(null)
    setMediaName(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePlayToggle = useCallback(() => {
    const media = mediaRef.current
    if (!media) {
      return
    }
    if (media.paused) {
      void media.play()
    } else {
      media.pause()
    }
  }, [])

  const handleSeek = useCallback((nextTime: number) => {
    const media = mediaRef.current
    if (!media) {
      return
    }
    media.currentTime = Math.max(0, nextTime)
  }, [])

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!duration || !laneRef.current) {
        return 0
      }
      const rect = laneRef.current.getBoundingClientRect()
      const scrollLeft = laneRef.current.scrollLeft
      const x = clientX - rect.left + scrollLeft
      const time = x / pixelsPerSecond
      return Math.max(0, Math.min(time, duration))
    },
    [duration, pixelsPerSecond]
  )

  const updateSegment = (id: string, updater: (segment: Segment) => Segment) => {
    setSegments((prev) => prev.map((segment) => (segment.id === id ? updater(segment) : segment)))
  }

  const handleAddSegment = () => {
    setSegments((prev) => {
      const sorted = [...prev].sort((a, b) => {
        if (a.startSec === b.startSec) {
          return a.endSec - b.endSec
        }
        return a.startSec - b.startSec
      })
      const lastEnd = sorted.length > 0 ? sorted[sorted.length - 1].endSec : currentTime
      const next = createSegment(labels[0] ?? '', lastEnd, lastEnd + 0.5)
      setSelectedSegmentId(next.id)
      return [...prev, next]
    })
  }

  const handleRemoveSegment = (id: string) => {
    setSegments((prev) => {
      const next = prev.filter((segment) => segment.id !== id)
      setSelectedSegmentId((current) => {
        if (current && current !== id) {
          return current
        }
        return next[0]?.id ?? null
      })
      return next
    })
  }

  const handleAddLabel = useCallback(() => {
    const next = window.prompt('New label')
    if (!next) {
      return
    }
    const trimmed = next.trim()
    if (!trimmed || labels.includes(trimmed)) {
      return
    }
    setLabels((prev) => [...prev, trimmed])
  }, [labels])

  const handleExport = () => {
    if (!canExport) {
      return
    }
    const srt = formatSrt(segments)
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    // Use the media filename as base, replacing extension with .srt
    const baseName = mediaName
      ? mediaName.replace(/\.[^/.]+$/, '')
      : 'labels'
    anchor.download = `${baseName}.srt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragRef.current
      if (!dragState) {
        return
      }
      const lane = laneRef.current
      const scrollDelta = lane ? lane.scrollLeft - (dragState as unknown as { startScrollLeft: number }).startScrollLeft : 0
      const deltaPx = event.clientX - dragState.startX + scrollDelta
      const deltaSeconds = deltaPx / pixelsPerSecond
      setSegments((prev) =>
        {
          const minGap = 0.001
          const sorted = [...prev].sort((a, b) => {
            if (a.startSec === b.startSec) {
              return a.endSec - b.endSec
            }
            return a.startSec - b.startSec
          })
          const currentIndex = sorted.findIndex((segment) => segment.id === dragState.id)
          const prevSegment = currentIndex > 0 ? sorted[currentIndex - 1] : null
          const nextSegment =
            currentIndex >= 0 && currentIndex < sorted.length - 1
              ? sorted[currentIndex + 1]
              : null

          const nextSegments = prev.map((segment) => ({ ...segment }))
          const current = nextSegments.find((segment) => segment.id === dragState.id)
          if (!current) {
            return prev
          }

          if (dragState.type === 'move') {
            let nextStart = dragState.startStart + deltaSeconds
            let nextEnd = dragState.startEnd + deltaSeconds
            if (nextStart < 0) {
              nextEnd += -nextStart
              nextStart = 0
            }
            if (nextEnd > dragState.duration) {
              const shiftBack = nextEnd - dragState.duration
              nextStart -= shiftBack
              nextEnd = dragState.duration
            }
            if (nextEnd - nextStart < minGap) {
              nextEnd = nextStart + minGap
            }
            current.startSec = nextStart
            current.endSec = nextEnd
            return nextSegments
          }

          if (dragState.type === 'start') {
            const minStart = prevSegment ? prevSegment.startSec + minGap : 0
            const nextStart = Math.min(
              Math.max(minStart, dragState.startStart + deltaSeconds),
              dragState.startEnd - minGap
            )
            current.startSec = nextStart
            if (prevSegment) {
              const prevTarget = nextSegments.find(
                (segment) => segment.id === prevSegment.id
              )
              if (prevTarget) {
                prevTarget.endSec = nextStart
              }
            }
            return nextSegments
          }

          const maxEnd = nextSegment ? nextSegment.endSec - minGap : dragState.duration
          const nextEnd = Math.max(
            Math.min(maxEnd, dragState.startEnd + deltaSeconds),
            dragState.startStart + minGap
          )
          current.endSec = nextEnd
          if (nextSegment) {
            const nextTarget = nextSegments.find((segment) => segment.id === nextSegment.id)
            if (nextTarget) {
              nextTarget.startSec = nextEnd
            }
          }
          return nextSegments
        }
      )
    },
    [setSegments]
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    playheadDragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove])

  const startDrag = useCallback(
    (
      event: React.PointerEvent,
      segment: Segment,
      type: 'move' | 'start' | 'end'
    ) => {
      if (!duration || !laneRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = {
        id: segment.id,
        type,
        startX: event.clientX,
        startStart: segment.startSec,
        startEnd: segment.endSec,
        duration,
        width: timelineWidth,
        startScrollLeft: laneRef.current.scrollLeft,
      } as unknown as {
        id: string
        type: 'move' | 'start' | 'end'
        startX: number
        startStart: number
        startEnd: number
        duration: number
        width: number
      }
      setSelectedSegmentId(segment.id)
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [duration, timelineWidth, handlePointerMove, handlePointerUp]
  )

  const handlePlayheadPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = playheadDragRef.current
      if (!dragState) {
        return
      }
      const nextTime = getTimeFromClientX(event.clientX)
      setCurrentTime(nextTime)
      const media = mediaRef.current
      if (media) {
        media.currentTime = nextTime
      }
    },
    [getTimeFromClientX]
  )

  const handlePlayheadPointerUp = useCallback(() => {
    playheadDragRef.current = null
    window.removeEventListener('pointermove', handlePlayheadPointerMove)
    window.removeEventListener('pointerup', handlePlayheadPointerUp)
  }, [handlePlayheadPointerMove])

  const startPlayheadDrag = useCallback(
    (event: React.PointerEvent) => {
      if (!duration || !laneRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      playheadDragRef.current = {
        startX: event.clientX,
        duration,
        width: timelineWidth,
      }
      const nextTime = getTimeFromClientX(event.clientX)
      setCurrentTime(nextTime)
      const media = mediaRef.current
      if (media) {
        media.currentTime = nextTime
      }
      window.addEventListener('pointermove', handlePlayheadPointerMove)
      window.addEventListener('pointerup', handlePlayheadPointerUp)
    },
    [getTimeFromClientX, handlePlayheadPointerMove, handlePlayheadPointerUp, duration, timelineWidth]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        handlePlayToggle()
        return
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault()
        const step = event.shiftKey ? 0.01 : 0.05
        handleSeek(currentTime - step)
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault()
        const step = event.shiftKey ? 0.01 : 0.05
        handleSeek(currentTime + step)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentTime, handlePlayToggle, handleSeek])

  return (
    <main className="workspace">
      <section className="workspace-top">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">Viewer</p>
            </div>
            <div className="file-slot">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept="video/*,audio/*"
                onChange={handleFileChange}
              />
              {mediaUrl ? (
                <div className="file-pill mono">
                  <span className="file-name">{mediaName}</span>
                  <button type="button" className="ghost-button" onClick={handleClearMedia}>
                    x
                  </button>
                </div>
              ) : (
                <button type="button" className="ghost-button" onClick={handleLoadClick}>
                  Load media
                </button>
              )}
            </div>
          </div>
          <div className="media-shell">
            {mediaUrl ? (
              <video ref={mediaRef} src={mediaUrl} controls className="media-player" />
            ) : (
              <div className="media-placeholder">Drop a video/audio file here.</div>
            )}
          </div>
          <div className="toolbar">
            <div className="toolbar-group">
              <button
                className="primary-button"
                onClick={handlePlayToggle}
                disabled={!mediaUrl}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                className="ghost-button"
                onClick={() => handleSeek(currentTime - 2)}
                disabled={!mediaUrl}
              >
                -2s
              </button>
              <button
                className="ghost-button"
                onClick={() => handleSeek(currentTime + 2)}
                disabled={!mediaUrl}
              >
                +2s
              </button>
            </div>
            <div className="toolbar-meta mono">
              <span>Playhead {formatTimecode(currentTime)}</span>
              <span>
                Duration {duration === null ? '--:--:--,---' : formatTimecode(duration)}
              </span>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">Inspector</p>
            </div>
          </div>

          <div className="editor-panel">
            <div>
              <div className="section-title">Active segment</div>
              {inspectorSegment ? (
                <div className="layout-stack">
                  <div>
                    <div className="row-header">
                      <label className="section-title">Start</label>
                      <button
                        type="button"
                        className="ghost-button small"
                        onClick={() =>
                          updateSegment(inspectorSegment.id, (prev) => ({
                            ...prev,
                            startSec: currentTime,
                          }))
                        }
                      >
                        Set to playhead
                      </button>
                    </div>
                    <div className="readout mono">
                      {formatTimecode(inspectorSegment.startSec)}
                    </div>
                  </div>
                  <div>
                    <div className="row-header">
                      <label className="section-title">End</label>
                      <button
                        type="button"
                        className="ghost-button small"
                        onClick={() =>
                          updateSegment(inspectorSegment.id, (prev) => ({
                            ...prev,
                            endSec: currentTime,
                          }))
                        }
                      >
                        Set to playhead
                      </button>
                    </div>
                    <div className="readout mono">
                      {formatTimecode(inspectorSegment.endSec)}
                    </div>
                  </div>
                  <div>
                    <div className="row-header">
                      <label className="section-title">Label</label>
                      <button type="button" className="ghost-button" onClick={handleAddLabel}>
                        Add new label
                      </button>
                    </div>
                    <select
                      className="text-input"
                      value={inspectorSegment.label}
                      onChange={(event) =>
                        updateSegment(inspectorSegment.id, (prev) => ({
                          ...prev,
                          label: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select label</option>
                      {labels.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="label-inline">
                    <button
                      className="ghost-button"
                      onClick={() => handleRemoveSegment(inspectorSegment.id)}
                    >
                      Delete segment
                    </button>
                  </div>
                </div>
              ) : (
                <div className="media-placeholder">Select a segment to edit.</div>
              )}
            </div>

            <div>
              <div className="section-title">SRT Preview</div>
              <pre className="srt-preview mono">
                {canExport ? formatSrt(segments) : issues.length > 0 ? issues.map(i => i.message).join('\n') : 'No segments'}
              </pre>
            </div>

            <div className="export-panel">
              <div className="section-title">Export</div>
              <button
                className="primary-button"
                onClick={handleExport}
                disabled={!canExport}
              >
                Download labels.srt
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="timeline">
        <div className="timeline-header">
          <span>Timeline</span>
          <div className="row-header">
            <span>{segments.length} segments</span>
            <div className="timeline-scale-control">
              <span className="timeline-scale-label">Scale</span>
              <input
                type="range"
                min="10"
                max="500"
                value={pixelsPerSecond}
                onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
                className="timeline-scale-slider"
              />
              <span className="timeline-scale-value mono">{pixelsPerSecond}px/s</span>
            </div>
            <button className="ghost-button" onClick={handleAddSegment}>
              Add segment
            </button>
          </div>
        </div>
        <div ref={laneRef} className="timeline-lane">
          <div className="timeline-ruler" style={{ width: timelineWidth > 0 ? timelineWidth : '100%' }}>
            {timelineTicks.map((tick) => (
              <div
                key={tick}
                className="timeline-tick"
                style={{ left: `${tick * pixelsPerSecond}px` }}
              >
                <span className="timeline-tick-label mono">
                  {formatTimecode(tick)}
                </span>
              </div>
            ))}
          </div>
          {duration ? (
            <div
              className="timeline-playhead"
              style={{ left: `${currentTime * pixelsPerSecond}px` }}
              onPointerDown={startPlayheadDrag}
            >
              <span className="timeline-playhead-handle" />
            </div>
          ) : null}
          {segments.map((segment) => {
            const isActive = segment.id === activeSegmentId
            const isSelected = segment.id === selectedSegmentId
            const width = (segment.endSec - segment.startSec) * pixelsPerSecond
            const left = segment.startSec * pixelsPerSecond
            return (
              <button
                key={segment.id}
                type="button"
                className={`timeline-clip ${isActive ? 'is-active' : ''} ${
                  isSelected ? 'is-selected' : ''
                }`}
                style={{
                  width: `${Math.max(width, 4)}px`,
                  left: `${Math.max(left, 0)}px`,
                }}
                onPointerDown={(event) => startDrag(event, segment, 'move')}
                onClick={() => setSelectedSegmentId(segment.id)}
              >
                <span className="timeline-clip-label">{segment.label || 'No label'}</span>
                <span
                  className="timeline-handle timeline-handle-start"
                  onPointerDown={(event) => startDrag(event, segment, 'start')}
                />
                <span
                  className="timeline-handle timeline-handle-end"
                  onPointerDown={(event) => startDrag(event, segment, 'end')}
                />
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
