# Design Document

## Overview

- Goal: Build a single-page SRT labeling tool that plays local media and exports README-compliant SRT.
- Scope: Local media upload, set start/end from current time, segment CRUD, label management, validation, export.
- Constraints: TanStack Start routing, HTML5 media element only, fixed export filename `labels.srt`.

## Architecture

### SRT Labeling Tool (NSKETCH-447)

- Page container: single route `src/routes/index.tsx` as `SrtLabelingPage` coordinating data flow and layout.
- Layout: After Effects-like split with top-left media viewer, top-right inspector, bottom timeline list.
- Editor flow: timeline items select a segment; right inspector edits start/end/label and handles validation/export.
- State separation: domain store (segments, labels, selection, playhead, duration) with derived active/validation state.

### Gemini Auto Segmentation (NSKETCH-452)

- Purpose: generate segment suggestions from video via Gemini API to reduce manual work.
- Integration: client calls server proxy (`/api/gemini/analyze`) and applies results explicitly (non-destructive preview first).
- Separation: API client/proxy, response normalization, and UI integration are kept in separate modules for DRY/low coupling.
- Retry: only transient errors (408/429/5xx) with exponential backoff and max attempts; include requestId in error response.
- Labels: preserve existing labels and add `munching start` / `munching end`; definitions included in the prompt.

## Utilities

- `timecode.ts`: canonical integer milliseconds, convert to/from SRT timecode; clamp and rounding rules.
- `srt-parse.ts`: tolerant parsing (CRLF/LF/BOM, comma/dot milliseconds, missing indices) to cues.
- `srt-format.ts`: strict serializer (reindex, sort by start then end, trailing newline, `HH:MM:SS,mmm`).
- `cue-validate.ts`: start < end, non-negative/NaN checks, overlap detection, label non-empty, out-of-range times.
- `media-sync.ts`: map media events to playhead updates; keep playhead in ms.

## Edge Cases

- `currentTime` can be `NaN` before `loadedmetadata`; `duration` can be `NaN/Infinity`.
- `timeupdate` is low-frequency; use `requestAnimationFrame` while playing and resync on media events.
- Float precision: store times as integer ms internally; compare with epsilon when needed.
- Setting `currentTime` may clamp to [0, duration]; handle `seeking/seeked`, `ratechange`, `waiting`, `stalled`, `ended`.
- Export: reindex cues, sort by start then end, ensure end > start, preserve multiline text, avoid blank-line delimiter corruption.

## Implementation Plan

### Libraries

- Use built-in HTML5 media element only; no external APIs or libraries for MVP.
- Add Gemini API via server-side proxy for video analysis (no client-side API keys).

### Key Decisions

- Labels are managed in the UI (add/delete/edit) and are editable per workflow.
- Initial template row is `START` to anchor the first segment.
- Deleting a label clears existing segment labels and blocks export until corrected.
- Export filename is fixed to `labels.srt` for MVP simplicity.
- Gemini analysis is a suggestion flow: generate → preview → explicit apply.
- Gemini API key stays on server; client uses proxy endpoint.
- Keep Gemini prompt/schema and parsing in one place to avoid drift.
- Retry only transient errors with capped attempts.

## TODO

## Open Questions

## Changelog

### 2026-03-03

- Pre-implementation snapshot recorded for NSKETCH-447 design decisions.
- Updated UI layout to After Effects-style workspace (viewer/inspector/timeline).

### 2026-03-04

- Pre-implementation snapshot recorded for gemini-auto-segmentation.
  - Architecture: server proxy + client suggestion preview + explicit apply.
  - Key decisions: server-only API key, single schema for prompt/parsing, retry transient errors only.
