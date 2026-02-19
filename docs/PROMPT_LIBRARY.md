# Prompt Library (VS Code Codex)

Run these prompts in order.

---

## 0) Planning (write an ExecPlan first)
**Prompt:**
Read AGENTS.md and docs/*.md. Write an ExecPlan (use .agent/PLANS.md) for DualRead v0.1.
Include:
- chunking strategy under DeepL limits
- DOM extraction strategy
- message passing design (popup/background/content)
- proxy API schema
- test plan
Do not write code yet.

---

## 1) Validate scaffold (proxy + extension)
**Prompt:**
$dualread-scaffold
Ensure:
- proxy runs locally and responds to /health
- extension loads in Chrome (unpacked)
- options page saves settings
Stop once manual smoke test passes.

---

## 2) Page translation MVP
**Prompt:**
$dualread-extension
Implement page translation:
- extract candidate blocks (p, headings, li, blockquote)
- batch translate via background -> proxy
- inject translations under originals with minimal styling
- toggle off removes injected nodes
Add simple caching in-memory.

---

## 3) Selection translate
**Prompt:**
Implement selection translate:
- context menu item
- on click, translate selectionText via proxy
- show tooltip near selection with translation
Persist last translation in memory.

---

## 4) Hardening
**Prompt:**
$dualread-review
Review for:
- no key exposure
- clear errors (proxy down, DeepL errors)
- batching avoids oversized payloads
- no sensitive logging
Add docs updates and missing tests.
