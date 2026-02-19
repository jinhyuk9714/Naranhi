# Codex Setup (VS Code)

## Recommended MCP servers
This project does not require OpenAI API, but docs access helps.

### Context7 (general developer docs)
- `codex mcp add context7 -- npx -y @upstash/context7-mcp`

(Optionally) add any MCP server you trust for Chrome extension docs.

## How to use skills
Skills are in `.agents/skills/`.
In Codex: type `$` then pick a skill, or run `/skills`.

Start with:
- `$dualread-spec` → refine MVP + acceptance
- `$dualread-scaffold` → ensure proxy + extension skeleton work
- `$dualread-extension` → implement page extraction/injection
- `$dualread-review` → hardening before release
