# simple-srt-editor

<!-- Sections below added by migrate-skills.py -->

---

## Rules & Standards

Coding standards enforced via `.claude/rules/`:

| Rule | Content |
|------|---------|
| `language.md` | English code, Japanese communication |
| `coding-principles.md` | Simplicity, single responsibility, early return |
| `testing.md` | TDD, AAA pattern, 80%+ coverage |
| `security.md` | Input validation, secrets management |

PostToolUse hook: auto lint/format on file changes.

## Skills

| Command | Description |
|---------|-------------|
| `/plan` | Step-by-step implementation planning |
| `/tdd` | Test-Driven Development workflow |
| `/simplify` | Code simplification |
| `/design-tracker` | Track design decisions automatically |
| `/update-design` | Update design document |

Design decisions: `.claude/docs/DESIGN.md`

## Documentation Management

| Command | Description |
|---------|-------------|
| `/research-lib` | Research libraries and save findings |
| `/update-lib-docs` | Update library constraint docs |

Library docs: `.claude/docs/libraries/`

## Multi-Agent Collaboration

| Agent | Strength | Use For |
|-------|----------|---------|
| **Claude Code** | 1M context, orchestration | Codebase analysis, implementation |
| **Codex CLI** | Deep reasoning | Design decisions, debugging, trade-offs |
| **Gemini CLI** | Google Search, multimodal | External research, PDF/video/audio |

### When to Use

- **Design/debug** → Codex (`/codex-system`)
- **External research** → Gemini (`/gemini-system`)
- **Codebase analysis** → Gemini subagent (`gemini-explore`)

### Context Management

| Output Size | Method |
|-------------|--------|
| Short (~50 lines) | Direct call OK |
| Large (50+ lines) | Via subagent |
| Reports | Subagent → save to `.claude/docs/` |

→ `.claude/rules/codex-delegation.md`, `.claude/rules/gemini-delegation.md`, `.claude/rules/tool-routing.md`

## Workflow

```
/startproject <feature>     Understand → Research & Design → Plan
    ↓ approval
/team-implement             Parallel implementation (Agent Teams)
    ↓ completion
/team-review                Parallel review (Agent Teams)
    ↓ completion
/deploy                     Push feature branch & return to original branch
```

| Command | Description |
|---------|-------------|
| `/startproject` | Multi-agent project initialization |
| `/team-implement` | Parallel implementation with Agent Teams |
| `/team-review` | Parallel code review with Agent Teams |
| `/deploy` | Push feature branch, return to original branch |

## Session Management

| Command | Description |
|---------|-------------|
| `/checkpointing` | Save session context and learnings |
| `/init` | Initialize project settings |

Checkpoints: `.claude/checkpoints/` | Logs: `.claude/logs/`

---

## Current Project: NSKETCH-447

### Context
- Goal: ローカルの動画/音声を再生しながらSRTラベルを作成し、README仕様のSRTを書き出す
- Key files: `src/routes/index.tsx`, `src/styles.css`, `src/components/Header.tsx`, `src/components/Footer.tsx`
- Dependencies: TanStack Start + React + Tailwind (existing)

### Architecture
- Single-page tool on `/` with HTML5 media element and segment editor UI
- Segment state and label list managed in React state; validation on export
- SRT formatting utility handles sort/reindex/timecode formatting per README

### Library Constraints
- No external APIs; use built-in HTML5 media element

### Decisions
- Labels are editable in UI; deleting a label clears existing segment labels and blocks export
- Initial template row is `START`
- Export file name is fixed to `labels.srt`

---

## Current Project: gemini-auto-segmentation

### Context
- Goal: 動画をGemini APIに送信してセグメント下地を自動生成し、手作業の作成時間を短縮する
- Key files: `src/routes/index.tsx`, `src/lib/types.ts`, `src/lib/segment-validate.ts`, `src/lib/srt-format.ts`
- Dependencies: TanStack Start + React + Tailwind, Gemini API (server-side proxy)

### Architecture
- Client calls server proxy endpoint to analyze video and returns segment suggestions
- Suggestions are previewed and explicitly applied (non-destructive flow)
- API, normalization, and UI integration are separated for DRY/low coupling

### Library Constraints
- Gemini API key must stay on server (no client-side exposure)

### Decisions
- Video only (no audio analysis)
- Labels: keep `START/END` and add `munching start`/`munching end`, initial label `x`
- Prompt includes label definitions for start/end transitions
