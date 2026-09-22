# Contributing to ProjectPulse

Thanks for your interest! ProjectPulse is a self-hosted tracker for project
websites, GitHub repos and feeds — see the [README](README.md) for what it does.

## Good first contributions

- **Issues** — the best way to start is a well-described bug report or feature
  request using the templates.
- **Docs** — the README and this file are intentionally plain; fixing unclear
  wording is welcome.
- **Checkers & rules** — `src/lib/checkers/` and `src/lib/rules.ts` are the
  core; small, isolated fixes are easy to review.
- **AI features** — `src/lib/ai.ts` is the provider seam; everything degrades
  gracefully without AI, so keep that invariant.

## Development

```bash
npm install
npm run dev        # http://localhost:4701, data in ./data
npm run build      # production build
npm run lint       # eslint
```

## Pull requests

- Small, focused PRs are preferred — one change per PR.
- Follow the existing conventions (App Router server components, SQLite read
  directly in the server, no new runtime dependencies without a reason).
- Fill in the PR template: what/why, screenshots for UI changes, how to test.
- AI features must keep working with **AI disabled** (`AI_ENABLED=false`).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
