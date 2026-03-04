## Research: Gemini API Video Segmentation (Gemini CLI)

### Commands Run
- gemini -p "What are the latest Gemini API options for video understanding? Include input formats, size limits, and how to send video for analysis." 2>/dev/null
- gemini -p "Best practices for extracting time segments/events from video with Gemini API. Provide prompt patterns and response schema suggestions." 2>/dev/null
- gemini -p "How does Gemini API return timestamps or time ranges for video content? Provide examples if available." 2>/dev/null
- gemini -p "Gemini API rate limits and pricing considerations for video analysis." 2>/dev/null

### 1) Latest Gemini video understanding API
- Supported video inputs include common containers: mp4, mov (QuickTime), avi, webm, mpeg/mpg, wmv, 3gpp, flv. Audio tracks are processed alongside video.
- Upload methods:
  - Files API (recommended): large videos, up to ~2 GB per file, with server-side processing. Files are typically stored for ~48 hours; wait for ACTIVE state before prompting.
  - Inline/base64: small clips (reported limits vary; keep under ~20 MB to avoid payload overhead).
  - Public YouTube URL: supported in preview for public videos.
- Default sampling is ~1 FPS (one frame per second) unless configured otherwise in SDKs that support video metadata / sampling options.
- Context window and duration support depend on model tier; reported ranges typically allow ~1–2 hours at 1 FPS and longer with efficiency modes or lower-resolution sampling.

### 2) Best practices for event/segment extraction prompts
- Use a multi-pass strategy:
  - Pass 1: coarse "chapterization" to identify major scene changes with start/end times.
  - Pass 2: fine-grained segments for subtitles or event lists.
- Provide strict output constraints (JSON-only or strict SRT template) to prevent drift.
- Include timing constraints: max segment length, no overlaps, monotonic timestamps, and timecode format (HH:MM:SS,mmm).
- Provide examples or a schema in the prompt; ask for a list of segments with text, start, end, and optional confidence.
- For corrections, send only problematic segments and ask for localized fixes to reduce cost and hallucinations.

### 3) Response structure suitable for timecode segments
- Structured JSON output is the most reliable:
  - Example schema:
    - segments: array
      - start_time: string (HH:MM:SS,mmm)
      - end_time: string (HH:MM:SS,mmm)
      - text: string
      - confidence: number (optional)
      - metadata: { speaker, event_type } (optional)
- Natural language responses can include timestamps, but JSON mode yields a stable, machine-readable result.
- Some SDKs allow response_schema/response_mime_type: "application/json" to enforce structure.

### 4) Rate limits / pricing caveats (high-level)
- Video is tokenized by frames and audio; at ~1 FPS, costs scale linearly with duration.
- Pricing and rate limits vary by model tier and account tier; watch for separate input/output prices and higher cost for large context windows.
- Batch processing can reduce cost (with longer latency). Context caching can reduce repeated analysis costs for long videos.

### Notes / Caveats
- Exact limits (file size, duration, RPM/TPM, price per 1M tokens) can change; verify with current Gemini API docs for your billing tier.
- Timestamp granularity depends on sampling rate; if you need sub-second precision, consider higher FPS sampling or post-processing in the UI.
