# Core Stack Preferences

Technical preferences for code generation and tooling.

Generated: 2026-01-08

---

## Language Preferences

| Priority | Language | Use Case |
|----------|----------|----------|
| 1 | Python | Primary for all new code, data science, ML, automation |
| 2 | TypeScript | Web apps, when JavaScript is required |

---

## Package Managers

| Language | Manager | Never Use |
|----------|---------|-----------| 
| Python | uv | pip, pip3 |
| JavaScript/TypeScript | bun | npm, yarn, pnpm |

---

## Environment

| Purpose | Tool |
|---------|------|
| Python | venv (always use) |
| JavaScript Runtime | Bun |

---

## Markup Preferences

| Format | Use | Never Use |
|--------|-----|-----------| 
| Markdown | All content, docs, notes | HTML for basic content |
| YAML | Configuration, frontmatter | - |
| JSON | API responses, data | - |

---

## Code Style

- Prefer explicit over clever
- No unnecessary abstractions
- Comments only where logic isn't self-evident
- Error messages should be actionable
- Always use type hints in Python
- Prefer dataclasses/pydantic for data structures
