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
import { buildGeminiPrompt } from '../lib/gemini-schema'
import { analyzeVideo } from '../lib/gemini-client'
import { normalizeGeminiSegments } from '../lib/gemini-normalize'
import { parseSrt } from '../lib/srt-parse'
import { useUndoHistory } from '../lib/use-undo-history'

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

const LABEL_COLORS: Record<string, string> = {
  START: '210, 80%, 55%',
  END: '0, 75%, 55%',
  x: '160, 50%, 45%',
  'munching start': '35, 85%, 55%',
  'munching end': '280, 60%, 55%',
}

const labelToHsl = (label: string): string => {
  if (LABEL_COLORS[label]) {
    return LABEL_COLORS[label]
  }
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = ((hash % 360) + 360) % 360
  return `${h}, 65%, 50%`
}

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
  const srtInputRef = useRef<HTMLInputElement | null>(null)
  const promptInputRef = useRef<HTMLInputElement | null>(null)
  const isScalingRef = useRef(false)
  const suppressAutoScrollRef = useRef(false)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaName, setMediaName] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS)
  const {
    state: segments,
    push: pushSegments,
    setWithoutHistory: setSegmentsNoHistory,
    undo: undoSegments,
    redo: redoSegments,
    saveSnapshot,
    commitSnapshot,
  } = useUndoHistory<Segment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(() =>
    segments[0]?.id ?? null
  )
  const [pixelsPerSecond, setPixelsPerSecond] = useState(100)
  const [promptText, setPromptText] = useState(() => buildGeminiPrompt())
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisMeta, setAnalysisMeta] = useState<string | null>(null)
  const [suggestedSegments, setSuggestedSegments] = useState<Segment[]>([])

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

  useEffect(() => {
    const match = segments.find(
      (s) => currentTime >= s.startSec && currentTime <= s.endSec
    )
    if (match) {
      setSelectedSegmentId(match.id)
    }
  }, [currentTime, segments])

  const activeSegmentId = useMemo(() => {
    return segments.find(
      (segment) => currentTime >= segment.startSec && currentTime <= segment.endSec
    )?.id ?? selectedSegmentId ?? null
  }, [currentTime, segments, selectedSegmentId])

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

  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec),
    [segments]
  )

  const inspectorIndex = useMemo(() => {
    if (!inspectorSegment) return null
    const idx = sortedSegments.findIndex((s) => s.id === inspectorSegment.id)
    return idx >= 0 ? idx + 1 : null
  }, [sortedSegments, inspectorSegment])

  const prevSegmentOfInspector = useMemo(() => {
    if (!inspectorSegment) return null
    const idx = sortedSegments.findIndex((s) => s.id === inspectorSegment.id)
    return idx > 0 ? sortedSegments[idx - 1] : null
  }, [sortedSegments, inspectorSegment])

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
    setMediaFile(file)
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
    setMediaFile(null)
    setAnalysisStatus('idle')
    setAnalysisError(null)
    setAnalysisMeta(null)
    setSuggestedSegments([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleAnalyze = useCallback(async () => {
    if (!mediaFile) {
      return
    }
    setAnalysisStatus('loading')
    setAnalysisError(null)
    setAnalysisMeta(null)
    try {
      const result = await analyzeVideo(mediaFile, promptText)
      const newLabels = [...new Set(result.segments.map((s) => s.label).filter(Boolean))]
      let updatedLabels = labels
      const missing = newLabels.filter((l) => !labels.includes(l))
      if (missing.length > 0) {
        updatedLabels = [...labels, ...missing]
        setLabels(updatedLabels)
      }
      const normalized = normalizeGeminiSegments(result.segments, duration, {
        labels: updatedLabels,
        defaultLabel: 'x',
      })
      setSuggestedSegments(normalized)
      if (result.meta?.totalDurationSec) {
        const metaLine = `Gemini analyzed up to ${result.meta.lastEndSec ?? 0}s of ${result.meta.totalDurationSec}s.`
        setAnalysisMeta(result.meta.coverageNotes ? `${metaLine} ${result.meta.coverageNotes}` : metaLine)
      }
      setAnalysisStatus('idle')
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Gemini analysis failed.'
      setAnalysisError(message)
      setAnalysisStatus('error')
    }
  }, [mediaFile, promptText, duration])

  const handleApplySuggestions = () => {
    if (suggestedSegments.length === 0) {
      return
    }
    setSegmentsNoHistory(suggestedSegments)
    setSelectedSegmentId(suggestedSegments[0]?.id ?? null)
    setSuggestedSegments([])
  }

  const handleDismissSuggestions = () => {
    setSuggestedSegments([])
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
    pushSegments((prev) => prev.map((segment) => (segment.id === id ? updater(segment) : segment)))
  }

  const handleAddSegment = () => {
    const newStart = currentTime
    const newEnd = currentTime + 0.1
    const overlapping = segments.some(
      (s) => s.startSec < newEnd && s.endSec > newStart
    )
    if (overlapping) {
      window.alert('Cannot add segment: overlaps with an existing segment at the current playhead position.')
      return
    }
    const next = createSegment(labels[0] ?? '', newStart, newEnd)
    pushSegments((prev) => [...prev, next])
    setSelectedSegmentId(next.id)
  }

  const handleRemoveSegment = (id: string) => {
    suppressAutoScrollRef.current = true
    pushSegments((prev) => {
      const next = prev.filter((segment) => segment.id !== id)
      setSelectedSegmentId((current) => {
        if (current && current !== id) {
          return current
        }
        return next[0]?.id ?? null
      })
      return next
    })
    setTimeout(() => {
      suppressAutoScrollRef.current = false
    }, 100)
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

  const handleImportSrt = useCallback(() => {
    srtInputRef.current?.click()
  }, [])

  const handleSrtFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result
        if (typeof text !== 'string') {
          return
        }
        const parsed = parseSrt(text)
        if (parsed.length === 0) {
          return
        }
        pushSegments(() => {
          setSelectedSegmentId(parsed[0]?.id ?? null)
          return parsed
        })
        const importedLabels = [...new Set(parsed.map((s) => s.label).filter(Boolean))]
        setLabels((prev) => {
          const merged = [...prev]
          for (const label of importedLabels) {
            if (!merged.includes(label)) {
              merged.push(label)
            }
          }
          return merged
        })
      }
      reader.readAsText(file)
      if (srtInputRef.current) {
        srtInputRef.current.value = ''
      }
    },
    [pushSegments]
  )

  const handleSavePrompt = useCallback(() => {
    const blob = new Blob([promptText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'prompt.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [promptText])

  const handleLoadPrompt = useCallback(() => {
    promptInputRef.current?.click()
  }, [])

  const handlePromptFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result
        if (typeof text === 'string') {
          setPromptText(text)
        }
      }
      reader.readAsText(file)
      if (promptInputRef.current) {
        promptInputRef.current.value = ''
      }
    },
    []
  )

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
      setSegmentsNoHistory((prev) =>
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
            const minStart = prevSegment ? prevSegment.endSec : 0
            const nextStart = Math.min(
              Math.max(minStart, dragState.startStart + deltaSeconds),
              dragState.startEnd - minGap
            )
            current.startSec = nextStart
            return nextSegments
          }

          const maxEnd = nextSegment ? nextSegment.startSec : dragState.duration
          const nextEnd = Math.max(
            Math.min(maxEnd, dragState.startEnd + deltaSeconds),
            dragState.startStart + minGap
          )
          current.endSec = nextEnd
          return nextSegments
        }
      )
    },
    [setSegmentsNoHistory]
  )

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      commitSnapshot()
    }
    dragRef.current = null
    suppressAutoScrollRef.current = false
    playheadDragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove, commitSnapshot])

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
      suppressAutoScrollRef.current = true
      saveSnapshot()
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
    [duration, timelineWidth, handlePointerMove, handlePointerUp, saveSnapshot]
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
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyZ') {
        event.preventDefault()
        redoSegments()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault()
        undoSegments()
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        handlePlayToggle()
        return
      }
      if (event.metaKey && event.code === 'ArrowRight') {
        event.preventDefault()
        const idx = sortedSegments.findIndex((s) => s.id === selectedSegmentId)
        if (idx >= 0 && idx < sortedSegments.length - 1) {
          setSelectedSegmentId(sortedSegments[idx + 1].id)
        }
        return
      }
      if (event.metaKey && event.code === 'ArrowLeft') {
        event.preventDefault()
        const idx = sortedSegments.findIndex((s) => s.id === selectedSegmentId)
        if (idx > 0) {
          setSelectedSegmentId(sortedSegments[idx - 1].id)
        }
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
  }, [currentTime, handlePlayToggle, handleSeek, sortedSegments, selectedSegmentId, undoSegments, redoSegments])

  useEffect(() => {
    const lane = laneRef.current
    if (!lane) return

    if (suppressAutoScrollRef.current) return
    if (dragRef.current) return
    if (isScalingRef.current) return

    if (!selectedSegmentId) return
    const seg = segments.find((s) => s.id === selectedSegmentId)
    if (!seg) return

    const segLeft = seg.startSec * pixelsPerSecond
    const segRight = seg.endSec * pixelsPerSecond
    const viewLeft = lane.scrollLeft
    const viewRight = lane.scrollLeft + lane.clientWidth

    if (segLeft >= viewLeft && segRight <= viewRight) return

    if (segRight - segLeft > lane.clientWidth) {
      lane.scrollLeft = segLeft
    } else if (segLeft < viewLeft) {
      lane.scrollLeft = segLeft
    } else {
      lane.scrollLeft = segRight - lane.clientWidth
    }
  }, [selectedSegmentId, segments, pixelsPerSecond])

  useEffect(() => {
    if (!isPlaying) return
    const lane = laneRef.current
    if (!lane) return
    if (dragRef.current) return
    if (isScalingRef.current) return

    const playheadX = currentTime * pixelsPerSecond
    const viewLeft = lane.scrollLeft
    const viewRight = lane.scrollLeft + lane.clientWidth
    const margin = lane.clientWidth * 0.15

    if (playheadX > viewRight - margin) {
      lane.scrollLeft = playheadX - lane.clientWidth + margin
    } else if (playheadX < viewLeft + margin) {
      lane.scrollLeft = playheadX - margin
    }
  }, [currentTime, isPlaying, pixelsPerSecond])

  return (
    <main className="workspace">
      <section className="workspace-top">
        <div className="workspace-left">
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
                accept="video/*"
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
        </article>

        <section className="panel prompt-section">
          <div className="panel-header">
            <p className="panel-title">Auto Label</p>
          </div>
          <div className="prompt-editor">
            <input
              ref={promptInputRef}
              type="file"
              className="sr-only"
              accept=".txt,.md"
              onChange={handlePromptFileChange}
            />
            <div className="row-header">
              <span className="section-title">Prompt</span>
              <div className="label-inline">
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={handleLoadPrompt}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={handleSavePrompt}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => setPromptText(buildGeminiPrompt())}
                >
                  Reset
                </button>
              </div>
            </div>
            <textarea
              className="prompt-textarea mono"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={6}
            />
            <div>
              <button
                className="ghost-button"
                onClick={handleAnalyze}
                disabled={!mediaFile || analysisStatus === 'loading'}
              >
                {analysisStatus === 'loading' ? 'Analyzing...' : 'Auto analyze'}
              </button>
            </div>
            <div>
              {analysisStatus === 'error' && analysisError ? (
                <div className="srt-preview mono">{analysisError}</div>
              ) : null}
              {analysisMeta ? <div className="srt-preview mono">{analysisMeta}</div> : null}
              {suggestedSegments.length > 0 ? (
                <div className="layout-stack">
                  <div className="srt-preview mono">{formatSrt(suggestedSegments)}</div>
                  <div className="label-inline">
                    <button className="primary-button" onClick={handleApplySuggestions}>
                      Apply suggestions
                    </button>
                    <button className="ghost-button" onClick={handleDismissSuggestions}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
        </div>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">Inspector</p>
            </div>
          </div>

          <div className="editor-panel">
            <div>
              <div className="row-header">
                <div className="section-title">Active segment</div>
                {inspectorSegment && (
                  <button
                    className="ghost-button small"
                    onClick={() => handleRemoveSegment(inspectorSegment.id)}
                  >
                    Delete segment
                  </button>
                )}
              </div>
              {inspectorSegment ? (
                <div className="layout-stack">
                  <div>
                    <div className="row-header">
                      <label className="section-title">Index</label>
                    </div>
                    <div className="readout mono">
                      {inspectorIndex !== null ? inspectorIndex : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="row-header">
                      <label className="section-title">Start</label>
                      <div className="label-inline">
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
                        <button
                          type="button"
                          className="ghost-button small"
                          disabled={!prevSegmentOfInspector}
                          onClick={() =>
                            updateSegment(inspectorSegment.id, (prev) => ({
                              ...prev,
                              startSec: prevSegmentOfInspector!.endSec,
                            }))
                          }
                        >
                          Snap to prev end
                        </button>
                      </div>
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
                      <button type="button" className="ghost-button small" onClick={handleAddLabel}>
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
                </div>
              ) : (
                <div className="media-placeholder">Select a segment to edit.</div>
              )}
            </div>

            <div>
              <div className="row-header">
                <div className="section-title">SRT Preview</div>
                <div className="label-inline">
                  <input
                    ref={srtInputRef}
                    type="file"
                    className="sr-only"
                    accept=".srt"
                    onChange={handleSrtFileChange}
                  />
                  <button
                    className="ghost-button small"
                    onClick={handleImportSrt}
                  >
                    Import SRT
                  </button>
                  <button
                    className="ghost-button small"
                    onClick={handleExport}
                    disabled={!canExport}
                  >
                    Export SRT
                  </button>
                </div>
              </div>
              <pre className="srt-preview mono">
                {canExport ? formatSrt(segments) : issues.length > 0 ? issues.map(i => i.message).join('\n') : 'No segments'}
              </pre>
            </div>
          </div>
        </article>
      </section>

      <section className="timeline">
        <div className="timeline-header">
          <div className="label-inline">
            <span>Timeline</span>
            <span className="mono">Playhead {formatTimecode(currentTime)}</span>
            <span className="mono">
              Duration {duration === null ? '--:--:--,---' : formatTimecode(duration)}
            </span>
            <span className="mono">Segments {segments.length}</span>
          </div>
          <div className="label-inline">
            <button
              className="ghost-button"
              onClick={() => handleSeek(currentTime - 1)}
              disabled={!mediaUrl}
            >
              -1s
            </button>
            <button
              className="ghost-button"
              onClick={() => handleSeek(currentTime - 0.1)}
              disabled={!mediaUrl}
            >
              -0.1s
            </button>
            <button
              className="ghost-button"
              onClick={handlePlayToggle}
              disabled={!mediaUrl}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              className="ghost-button"
              onClick={() => handleSeek(currentTime + 0.1)}
              disabled={!mediaUrl}
            >
              +0.1s
            </button>
            <button
              className="ghost-button"
              onClick={() => handleSeek(currentTime + 1)}
              disabled={!mediaUrl}
            >
              +1s
            </button>
          </div>
          <div className="row-header">
            <button className="ghost-button" onClick={handleAddSegment}>
              Add new segment at current playhead
            </button>
          </div>
        </div>
        <div ref={laneRef} className="timeline-lane" onClick={(event) => {
          if ((event.target === event.currentTarget || (event.target as HTMLElement).closest('.timeline-ruler')) && !(event.target as HTMLElement).closest('.timeline-clip')) {
            const nextTime = getTimeFromClientX(event.clientX)
            handleSeek(nextTime)
          }
        }}>
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
            const sortedIndex = sortedSegments.findIndex((s) => s.id === segment.id) + 1
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
                  borderColor: `hsl(${labelToHsl(segment.label)})`,
                  backgroundColor: `hsla(${labelToHsl(segment.label)}, ${isActive ? 0.85 : 0.5})`,
                  borderWidth: isActive ? '4px 6px' : undefined,
                }}
                onPointerDown={(event) => startDrag(event, segment, 'move')}
                onClick={() => setSelectedSegmentId(segment.id)}
              >
                <span className="timeline-clip-index">{sortedIndex}</span>
                <span className="timeline-clip-label">{segment.label || 'No label'}</span>
                <span
                  className="timeline-handle timeline-handle-start"
                  style={{ '--handle-color': `hsla(${labelToHsl(segment.label)}, 0.7)` } as React.CSSProperties}
                  onPointerDown={(event) => startDrag(event, segment, 'start')}
                />
                <span
                  className="timeline-handle timeline-handle-end"
                  style={{ '--handle-color': `hsla(${labelToHsl(segment.label)}, 0.7)` } as React.CSSProperties}
                  onPointerDown={(event) => startDrag(event, segment, 'end')}
                />
              </button>
            )
          })}
        </div>
        <div className="timeline-footer">
          <div className="timeline-scale-control">
            <span className="timeline-scale-label">Scale</span>
            <input
              type="range"
              min="10"
              max="500"
              value={pixelsPerSecond}
              onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
              onPointerDown={() => { isScalingRef.current = true }}
              onPointerUp={() => { isScalingRef.current = false }}
              onLostPointerCapture={() => { isScalingRef.current = false }}
              className="timeline-scale-slider"
            />
            <span className="timeline-scale-value mono">{pixelsPerSecond}px/s</span>
          </div>
        </div>
      </section>
    </main>
  )
}
