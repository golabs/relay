# Discover Project Stack

Analyze the current project and generate/update `.claude/STACK.md` with detected technologies.

## Instructions

Perform comprehensive project analysis to detect the technology stack. Follow each section below and collect all findings into a structured STACK.md file.

## Phase 1: File Discovery

First, discover key configuration files in the project root and common subdirectories.

### Check for these files:

**Node.js/JavaScript/TypeScript:**
- `package.json` (root, frontend/, backend/, packages/*)
- `tsconfig.json`, `tsconfig.*.json`
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`

**Python:**
- `pyproject.toml`
- `requirements.txt`, `requirements-*.txt`
- `setup.py`, `setup.cfg`
- `uv.lock`, `poetry.lock`, `Pipfile.lock`

**General:**
- `Makefile`
- `docker-compose.yml`, `Dockerfile`
- `.env`, `.env.example`

Use glob patterns to find these files:
```
**/package.json
**/tsconfig.json
**/pyproject.toml
**/requirements*.txt
```

## Phase 2: Language & Runtime Detection

### Node.js Detection
If `package.json` exists:
- Read and parse `package.json`
- Check `engines.node` for version requirement
- Identify package manager from lock file:
  - `package-lock.json` → npm
  - `yarn.lock` → yarn
  - `pnpm-lock.yaml` → pnpm

### TypeScript Detection
If `tsconfig.json` exists OR `package.json` has `typescript` in dependencies/devDependencies:
- Mark TypeScript as detected
- Note tsconfig location

### Python Detection
If any Python config exists (`pyproject.toml`, `requirements.txt`, `setup.py`):
- Check for `.python-version` or `pyproject.toml [tool.python]` for version
- Identify package manager:
  - `uv.lock` → uv
  - `poetry.lock` → poetry
  - `Pipfile.lock` → pipenv
  - `requirements.txt` only → pip

## Phase 3: Framework Detection

### From package.json dependencies:
- `react` → React
- `vue` → Vue
- `next` → Next.js
- `express` → Express
- `@nestjs/core` → NestJS
- `fastify` → Fastify

### From pyproject.toml or requirements.txt:
- `fastapi` → FastAPI
- `django` → Django
- `flask` → Flask
- `starlette` → Starlette

## Phase 4: Testing Framework Detection

### JavaScript/TypeScript:
- `jest` in dependencies → Jest
  - Config: `jest.config.js`, `jest.config.ts`, package.json `jest` key
  - Command: `npm test` or `npm run test`
- `vitest` in dependencies → Vitest
  - Config: `vitest.config.ts`, `vite.config.ts`
  - Command: `npm run test` or `npx vitest`
- `@playwright/test` in dependencies → Playwright
  - Config: `playwright.config.ts`
  - Command: `npx playwright test`
- `cypress` in dependencies → Cypress
  - Config: `cypress.config.ts`, `cypress.json`
  - Command: `npx cypress run`

### Python:
- `pytest` in dependencies → pytest
  - Config: `pytest.ini`, `pyproject.toml [tool.pytest]`, `conftest.py`
  - Command: `pytest` or `uv run pytest` or `python -m pytest`
- `unittest` (stdlib) - check for `tests/test_*.py` pattern

## Phase 5: Linting & Formatting Detection

### JavaScript/TypeScript:
- `eslint` → ESLint
  - Config: `.eslintrc.*`, `eslint.config.js`, package.json `eslintConfig`
  - Command: `npm run lint` or `npx eslint .`
- `prettier` → Prettier
  - Config: `.prettierrc.*`, `prettier.config.js`
  - Command: `npm run format` or `npx prettier --check .`
- `biome` → Biome
  - Config: `biome.json`

### Python:
- `ruff` → Ruff
  - Config: `ruff.toml`, `pyproject.toml [tool.ruff]`
  - Command: `ruff check .` or `uv run ruff check .`
- `black` → Black
  - Config: `pyproject.toml [tool.black]`
  - Command: `black --check .`
- `flake8` → Flake8
  - Config: `.flake8`, `setup.cfg`
- `mypy` → mypy
  - Config: `mypy.ini`, `pyproject.toml [tool.mypy]`
  - Command: `mypy .`
- `pylint` → Pylint
  - Config: `.pylintrc`, `pyproject.toml [tool.pylint]`

## Phase 6: Build Tool Detection

### JavaScript/TypeScript:
- `vite` → Vite
  - Config: `vite.config.ts`, `vite.config.js`
  - Build: `npm run build` (typically outputs to `dist/`)
- `webpack` → Webpack
  - Config: `webpack.config.js`
- `esbuild` → esbuild
- `tsc` in scripts → TypeScript compiler
  - Build: `npm run build` or `npx tsc`

### Type checking:
- Look for `type-check` or `typecheck` script in package.json
- Or use `npx tsc --noEmit`

## Phase 7: Database Detection

- `prisma` in dependencies → Prisma
  - Config: `prisma/schema.prisma`
  - Look for DATABASE_URL in `.env`
- `*.db` files → SQLite
- `pg` or `postgres` in dependencies → PostgreSQL
- `mongodb` or `mongoose` in dependencies → MongoDB
- `sqlalchemy` in Python deps → SQLAlchemy
- Check for `alembic/` directory → Alembic migrations

## Phase 8: Directory Structure

Check for common directories:
- `src/` - Source code
- `tests/` or `test/` or `__tests__/` - Tests
- `frontend/` - Frontend code
- `backend/` - Backend code
- `packages/` - Monorepo packages
- `dist/` or `build/` - Build output
- `public/` or `static/` - Static assets

## Phase 9: Script Detection

### From package.json scripts:
Parse the `scripts` section and identify:
- `dev`, `start:dev` → Development server command
- `build` → Build command
- `test` → Test command
- `lint` → Lint command
- `type-check`, `typecheck`, `tsc` → Type check command
- `format`, `prettier` → Format command

### From pyproject.toml [project.scripts] or [tool.poetry.scripts]:
Identify entry points and commands

### From Makefile:
Parse common targets: `test`, `lint`, `build`, `dev`, `install`

## Phase 10: Generate STACK.md

After collecting all information, generate a complete `.claude/STACK.md` file.

### Preserve User Notes
If `.claude/STACK.md` already exists, preserve the content in the `## Notes` section.

### Format Guidelines
- Use "yes" / "no" for Detected columns
- Include actual file paths for Config File columns
- Include actual commands for Run Command columns
- Set Primary Language based on what's most prominent
- Update the timestamp at the bottom

## Phase 11: Report Summary

After generating STACK.md, provide a summary:

```markdown
## Stack Discovery Complete

### Detected Technologies

**Languages:** [list]
**Frameworks:** [list]
**Testing:** [list]
**Linting:** [list]

### Key Commands Detected

| Purpose | Command |
|---------|---------|
| Dev Server | [command] |
| Build | [command] |
| Test | [command] |
| Lint | [command] |
| Type Check | [command] |

### Files Analyzed
- [list of key config files found]

### Recommendations
- [any suggestions for missing tooling or configuration]

Configuration saved to `.claude/STACK.md`
```

## Handling Uncertainty

If detection is uncertain (e.g., multiple package managers, conflicting configs):
1. Note all possibilities in STACK.md
2. Ask the user for clarification using AskUserQuestion
3. Update STACK.md with confirmed choices

## Monorepo Support

For monorepos (detected by `packages/`, `workspaces` in package.json, or multiple package.json files):
1. Identify root package manager and config
2. List each package/workspace separately in Notes section
3. Aggregate all testing and linting tools across packages
