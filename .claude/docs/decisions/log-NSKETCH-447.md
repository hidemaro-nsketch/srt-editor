### [startproject] DECISION — 2026-03-03

- **担当者**: ユーザー + Claude Lead
- **概要**: ローカル動画/音声アップロード + HTML5プレイヤーで再生し、現在時刻をstart/endにセットしてSRTを作成する
- **理由**: MVPは外部依存なく最小のフローで開始したい
- **ステータス**: 承認済み

### [startproject] DECISION — 2026-03-03

- **担当者**: ユーザー + Claude Lead
- **概要**: ラベルはUIで任意に管理（追加/削除/編集）する
- **理由**: 運用ごとにラベルセットを変えたい
- **ステータス**: 承認済み

### [startproject] DECISION — 2026-03-03

- **担当者**: ユーザー + Claude Lead
- **概要**: 初期テンプレ行は `START` を1行追加する
- **理由**: 作業開始時にSTARTを必ず置きたい
- **ステータス**: 承認済み

### [startproject] DECISION — 2026-03-03

- **担当者**: ユーザー + Claude Lead
- **概要**: ラベル削除時は既存セグメントのラベルを空にし、エクスポート時にエラー対象とする
- **理由**: 不正なラベルを見落とさず修正できるようにするため
- **ステータス**: 承認済み

### [startproject] DECISION — 2026-03-03

- **担当者**: ユーザー + Claude Lead
- **概要**: エクスポートファイル名は `labels.srt` に固定する
- **理由**: MVPの運用を簡素化するため
- **ステータス**: 承認済み

### [startproject] PRE — 2026-03-03

- **担当者**: Claude Lead
- **概要**: プロジェクト概要書を作成（NSKETCH-447）
- **成果物**: `.claude/docs/decisions/brief-NSKETCH-447.md`

### [startproject] POST — 2026-03-03

- **担当者**: Claude Lead
- **概要**: 計画フェーズ完了、5タスクに分割、Linear にコメント投稿済み
- **成果物**: `.claude/docs/DESIGN.md`, `.claude/docs/research/NSKETCH-447.md`

### [team-implement] PRE — 2026-03-03

- **担当者**: Claude Lead
- **概要**: 実装フェーズ開始、設計決定を記録
- **成果物**: `.claude/docs/DESIGN.md`（design-tracker により更新）

### [team-implement] DECISION — 2026-03-03

- **担当者**: Claude Lead（Gemini サブエージェント経由）
- **概要**: フィーチャーブランチ `feature/nsketch-447` を `main` から作成
- **理由**: 標準フィーチャーブランチワークフロー
- **ステータス**: 承認済み
- **成果物**: ブランチ `feature/nsketch-447`

### [team-implement] POST — 2026-03-03

- **担当者**: Claude Lead
- **概要**: 実装完了、品質チェックは `pnpm test` が「テスト未検出」で失敗
- **成果物**: `.claude/docs/decisions/implementation-NSKETCH-447.md`
