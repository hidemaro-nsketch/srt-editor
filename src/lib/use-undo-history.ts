import { useState, useCallback, useRef } from 'react'

const MAX_HISTORY = 10

type UndoHistory<T> = {
  past: T[]
  future: T[]
}

export function useUndoHistory<T>(initial: T) {
  const [state, setState] = useState<T>(initial)
  const historyRef = useRef<UndoHistory<T>>({ past: [], future: [] })
  const snapshotRef = useRef<T | null>(null)

  const push = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
      const history = historyRef.current
      history.past = [...history.past.slice(-(MAX_HISTORY - 1)), prev]
      history.future = []
      return resolved
    })
  }, [])

  const setWithoutHistory = useCallback((next: T | ((prev: T) => T)) => {
    setState(next)
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      const history = historyRef.current
      if (history.past.length === 0) {
        return current
      }
      const previous = history.past[history.past.length - 1]
      history.past = history.past.slice(0, -1)
      history.future = [...history.future, current]
      return previous
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const history = historyRef.current
      if (history.future.length === 0) {
        return current
      }
      const next = history.future[history.future.length - 1]
      history.future = history.future.slice(0, -1)
      history.past = [...history.past, current]
      return next
    })
  }, [])

  const saveSnapshot = useCallback(() => {
    setState((current) => {
      snapshotRef.current = current
      return current
    })
  }, [])

  const commitSnapshot = useCallback(() => {
    const snapshot = snapshotRef.current
    if (snapshot === null) {
      return
    }
    snapshotRef.current = null
    setState((current) => {
      const history = historyRef.current
      history.past = [...history.past.slice(-(MAX_HISTORY - 1)), snapshot]
      history.future = []
      return current
    })
  }, [])

  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  return { state, push, setWithoutHistory, undo, redo, saveSnapshot, commitSnapshot, canUndo, canRedo }
}
