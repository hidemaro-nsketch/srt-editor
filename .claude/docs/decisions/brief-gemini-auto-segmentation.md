## Project Brief: gemini-auto-segmentation

### Current State
- Architecture: Single-page SRT labeling tool on `/` with HTML5 media element and segment editor UI.
- Relevant code: `src/routes/index.tsx`, `src/lib/types.ts`, `src/lib/segment-validate.ts`, `src/lib/srt-format.ts`.
- Patterns: Segment state in React, validation before export, SRT formatting utility.

### Goal
Gemini APIを使って動画からセグメント下地を自動生成し、手作業の作成時間を短縮する。

### Scope
- Include: 動画アップロード→Gemini APIでセグメント生成→Editorに反映。
- Include: ラベル `x`, `munching start`, `munching end`, `START`, `END` を扱えること。
- Exclude: 音声入力・音声解析。

### Constraints
- Gemini APIはサーバー側プロキシ経由で呼び出す。
- DRY・機能疎結合を重視。

### Success Criteria
- 自動生成したセグメントを基に、SRTをダウンロードできる。
- 手作業でのセグメント作成より時間短縮される。
