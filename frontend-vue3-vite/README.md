# Vue 3 + Vite + TypeScript Template

A modern Vue 3 (Composition API) + Vite + TypeScript project template, optimized for AI-assisted development.

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (required)

### Setup

```bash
pnpm install
pnpm dev
```

## Command Contract

Use this command set consistently (same contract as `react-vite`).

```bash
# Development
pnpm dev         # Dev server
pnpm build       # Production build
pnpm preview     # Preview production build

# Quality gate
pnpm type-check  # TypeScript check (vue-tsc --noEmit)
pnpm lint        # ESLint (.vue + .ts files)
pnpm check       # type-check + lint (run before commit)

# Formatting
pnpm format
pnpm format:check
```

Workspace-level checks (run from monorepo root):

```bash
pnpm check:templates  # Runs pnpm check for vue3-vite + react-vite
pnpm check:versions   # Verifies package.json version alignment across templates
```

## Project Layout (Isomorphic with React template)

```text
src/
├── components/        # Shared components
│   └── ui/           # Radix-vue based UI primitives
├── examples/         # Reference only, never copy directly to production
│   ├── api-example.ts
│   ├── form-example.vue
│   └── list-page-example.vue
├── lib/              # API and utilities
│   ├── api.ts
│   ├── services.ts
│   └── utils.ts
├── pages/            # Route-level pages
│   ├── Home.vue
│   ├── ExamplesPage.vue
│   └── NotFound.vue
├── router/
│   └── index.ts      # Hash router (includes /examples)
├── App.vue
├── main.ts
└── style.css
```

## Examples Policy

- `src/examples/*` is pattern reference only.
- Re-implement the pattern in real feature files.
- Do not paste example files into production code.

## AI Agent Workflow (minimum path)

### New page (5 steps)

1. Add page in `src/pages/<FeatureName>.vue`.
2. Register route in `src/router/index.ts`.
3. Use existing UI primitives from `src/components/ui`.
4. Add service calls through `src/lib/services.ts` when needed.
5. Run `pnpm check`.

### New API flow (4 steps)

1. Define API call in `src/lib/api.ts` or service module.
2. Add typed wrapper in `src/lib/services.ts`.
3. Consume from page/component through the service wrapper.
4. Run `pnpm check`.

## Stack

- Vue 3 (Composition API, `<script setup lang="ts">`)
- Vite
- TypeScript (strict)
- Tailwind CSS
- Radix Vue primitives
- VeeValidate + Zod
- Axios

## License

MIT
