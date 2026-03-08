# Security Review: gemini-auto-segmentation

Scope: src/routes/api/gemini/analyze.ts, src/routes/index.tsx, src/lib/gemini-client.ts, src/lib/gemini-normalize.ts, src/lib/gemini-schema.ts, src/routeTree.gen.ts
Reference: .claude/rules/security.md

## Findings

### 1) Missing file upload validation
- Severity: High
- File/Line: src/routes/api/gemini/analyze.ts:153-167
- Description: The API accepts any uploaded file and only checks that `file` exists. There is no MIME/type whitelist, extension check, or size limit. This allows oversized uploads (resource exhaustion) and non-video payloads to be forwarded to Gemini.
- Recommended fix: Enforce server-side validation for file size and allowed MIME types (e.g., `video/*` with explicit whitelist). Reject files over a safe size threshold before upload. Consider validating file extension and/or sniffing MIME from file header where possible.

### 2) Unbounded prompt input
- Severity: Medium
- File/Line: src/routes/api/gemini/analyze.ts:154-167
- Description: `prompt` is accepted from the client without length limits or sanitization. Extremely large prompts can cause unnecessary cost, timeouts, or memory use.
- Recommended fix: Add a max length (e.g., 4-8 KB) and reject empty/oversized prompts with a 400 response. Consider server-side prompt construction to avoid accepting arbitrary user prompts.

### 3) Sensitive data exposure via debug logs
- Severity: Medium
- File/Line: src/routes/api/gemini/analyze.ts:47-53, 68-70, 92-94, 100-101, 120-123, 128-129, 200-205, 216-219
- Description: Debug logging is always enabled (`const debug = true` at line 170). Logs include file name, size, MIME type, Gemini file URI, and raw error response snippets from Gemini. These can expose sensitive content or identifiers in server logs.
- Recommended fix: Disable debug logs by default and gate them behind an environment flag (e.g., `process.env.DEBUG_GEMINI === 'true'`). Avoid logging raw response bodies; log only status codes and request IDs.

### 4) Error message reflection to client
- Severity: Low
- File/Line: src/routes/api/gemini/analyze.ts:237-240
- Description: The handler returns `error.message` directly to clients. If upstream errors include internal details, those could be exposed to the UI.
- Recommended fix: Return a generic error message to clients and log the detailed error server-side. Keep requestId for correlation.

## Notes
- No hardcoded secrets detected. API key is sourced from `process.env.GEMINI_API_KEY`.
- No SQL usage in scope.
- No file path handling or local file writes in scope.
