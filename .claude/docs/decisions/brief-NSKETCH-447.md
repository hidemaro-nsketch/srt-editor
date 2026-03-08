## Project Brief: NSKETCH-447

### Current State
- Architecture: TanStack Start + React + Tailwind、単一ページ構成
- Relevant code: `src/routes/index.tsx`, `src/routes/__root.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/styles.css`
- Patterns: 既存のレイアウト/トーンを踏襲、ルートはTanStack Router

### Goal
ローカルの動画/音声を再生しながらセグメントを作成・編集し、README仕様に準拠したSRTをダウンロードできるツールを提供する。

### Scope
- Include: ローカルメディアアップロード、start/endセット、セグメントCRUD、ラベル管理、アクティブ判定、SRTエクスポート
- Exclude: 外部API連携、オーバーラップ検出の厳密化、タイムライン編集UI、SRTインポート

### Constraints
- TanStack Start構成に準拠
- SRT出力はREADME仕様に厳密準拠（並び順/連番/フォーマット）
- exportファイル名は `labels.srt` 固定
- 初期テンプレ行は `START`
- ラベル削除時は既存セグメントのラベルを空にしてエラー対象

### Success Criteria
- READMEのSRT仕様通りに書き出される
- バリデーションで異常値を検出しエクスポートを止められる
- ローカルファイルから再生し、start/endを現在時刻でセットできる
