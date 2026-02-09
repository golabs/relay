---
description: CI/CD Pipeline Builder - Generate GitHub Actions, GitLab CI, Azure Pipelines
---

# CI/CD Pipeline Builder

Auto-generate production-ready CI/CD pipelines based on project analysis.

## Usage

```
/build-pipeline [--platform=PLATFORM] [--features=FEATURES]
```

**Platforms:**
- `github` - GitHub Actions (default)
- `gitlab` - GitLab CI
- `azure` - Azure Pipelines
- `all` - Generate for all platforms

**Features:**
- `test` - Run tests
- `lint` - Code linting
- `build` - Build artifacts
- `deploy` - Deployment config
- `docker` - Docker build/push
- `release` - Release automation
- `security` - Security scanning

## Step 1: Analyze Project

```bash
# Detect package managers and languages
ls package.json pyproject.toml requirements.txt Cargo.toml go.mod pom.xml build.gradle 2>/dev/null

# Check for existing CI config
ls .github/workflows/*.yml .gitlab-ci.yml azure-pipelines.yml 2>/dev/null

# Detect frameworks
grep -l "next\|react\|vue\|angular" package.json 2>/dev/null
grep -l "django\|flask\|fastapi" requirements.txt pyproject.toml 2>/dev/null

# Check for Docker
ls Dockerfile docker-compose.yml 2>/dev/null

# Check test frameworks
grep -l "jest\|vitest\|pytest\|mocha" package.json pyproject.toml 2>/dev/null
```

## Step 2: Generate GitHub Actions

### Node.js Project

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

env:
  NODE_VERSION: '20'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level=high

      - name: Run Snyk scan
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Python Project

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

env:
  PYTHON_VERSION: '3.11'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: |
          pip install ruff black mypy
          pip install -r requirements.txt

      - name: Run ruff
        run: ruff check .

      - name: Run black
        run: black --check .

      - name: Run mypy
        run: mypy . --ignore-missing-imports

  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt pytest pytest-cov

      - name: Run tests
        run: pytest --cov=. --cov-report=xml
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Upload coverage
        uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Run safety check
        run: |
          pip install safety
          safety check -r requirements.txt

      - name: Run bandit
        run: |
          pip install bandit
          bandit -r . -ll
```

### Docker Build & Push

```yaml
# .github/workflows/docker.yml
name: Docker Build

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Release Automation

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        uses: orhun/git-cliff-action@v2
        with:
          config: cliff.toml
          args: --latest --strip header

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body: ${{ steps.changelog.outputs.content }}
          draft: false
          prerelease: ${{ contains(github.ref, 'alpha') || contains(github.ref, 'beta') }}
```

## Step 3: Generate GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - lint
  - test
  - build
  - security
  - deploy

variables:
  NODE_VERSION: "20"
  PYTHON_VERSION: "3.11"

.node-cache:
  cache:
    key: ${CI_COMMIT_REF_SLUG}-node
    paths:
      - node_modules/

lint:
  stage: lint
  image: node:${NODE_VERSION}
  extends: .node-cache
  script:
    - npm ci
    - npm run lint

test:
  stage: test
  image: node:${NODE_VERSION}
  extends: .node-cache
  services:
    - postgres:15
  variables:
    POSTGRES_DB: test_db
    POSTGRES_PASSWORD: postgres
  script:
    - npm ci
    - npm test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  image: node:${NODE_VERSION}
  extends: .node-cache
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

security:
  stage: security
  image: node:${NODE_VERSION}
  script:
    - npm audit --audit-level=high
  allow_failure: true

docker-build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
    - tags

deploy-staging:
  stage: deploy
  image: alpine:latest
  script:
    - echo "Deploy to staging"
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - main

deploy-production:
  stage: deploy
  image: alpine:latest
  script:
    - echo "Deploy to production"
  environment:
    name: production
    url: https://example.com
  when: manual
  only:
    - tags
```

## Step 4: Generate Azure Pipelines

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - master

pr:
  branches:
    include:
      - main
      - master

pool:
  vmImage: 'ubuntu-latest'

variables:
  nodeVersion: '20.x'

stages:
  - stage: Build
    jobs:
      - job: Lint
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)

          - script: npm ci
            displayName: 'Install dependencies'

          - script: npm run lint
            displayName: 'Run linter'

      - job: Test
        dependsOn: Lint
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)

          - script: npm ci
            displayName: 'Install dependencies'

          - script: npm test -- --coverage
            displayName: 'Run tests'

          - task: PublishCodeCoverageResults@1
            inputs:
              codeCoverageTool: Cobertura
              summaryFileLocation: $(System.DefaultWorkingDirectory)/coverage/cobertura-coverage.xml

      - job: Build
        dependsOn: Test
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)

          - script: npm ci
            displayName: 'Install dependencies'

          - script: npm run build
            displayName: 'Build project'

          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: 'dist'
              artifactName: 'build'

  - stage: Deploy
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployToStaging
        environment: 'staging'
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "Deploy to staging"
                  displayName: 'Deploy'
```

## Output

```markdown
## Pipeline Generation Report

**Platform:** [platform]
**Project Type:** [type]
**Date:** [timestamp]

### Generated Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Main CI pipeline |
| `.github/workflows/docker.yml` | Docker build & push |
| `.github/workflows/release.yml` | Release automation |

### Features Enabled

- [x] Linting
- [x] Testing with coverage
- [x] Build artifacts
- [x] Security scanning
- [x] Docker support
- [x] Release automation

### Secrets Required

| Secret | Purpose | How to Add |
|--------|---------|------------|
| `SNYK_TOKEN` | Security scanning | Settings > Secrets |
| `CODECOV_TOKEN` | Coverage reports | Settings > Secrets |

### Next Steps

1. Review generated pipeline files
2. Add required secrets
3. Push to trigger first run
4. Monitor and adjust as needed
```
