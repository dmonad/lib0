# AGENTS.md

Guidance for AI coding agents working in **lib0-like projects** — small, isomorphic JavaScript utility packages that follow the conventions pioneered by [lib0](https://github.com/dmonad/lib0). Project-specific `CLAUDE.md` (or equivalent) overrides anything here.

## No quick-fixes

Before writing `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `any`-cast, empty catch, widened type, or loosened assertion: stop. State the root cause in one sentence. If you can't, investigate or ask — don't suppress. If suppression is genuinely correct, add `// reason: <root cause>` on the line above; without it, the suppression is rejected.

Type error → fix the JSDoc or the invariant, don't widen. Failing test → fix the bug or the wrong assumption, don't loosen. Flaky fuzz test → reproduce with `--seed <n>` and fix.

## Project shape

- **ESM only.** `"type": "module"` in `package.json`. No CommonJS build.
- **Isomorphic.** Runs in Node, browsers, Deno, Bun, React Native. Environment-specific modules ship as `foo.js` (default/browser), `foo.node.js`, `foo.deno.js`, `foo.react-native.js`, wired via conditional `exports`.
- **JSDoc, not TypeScript.** Source is `.js` with JSDoc (`@type`, `@param`, `@returns`, `@template`, `@typedef`). `tsconfig.json` sets `allowJs: true, checkJs: true, strict: true`; `npm run lint` runs `tsc --noEmit`. If a type is hard to express, write better JSDoc — do not add `.ts` files.
- **No circular imports.** `dpdm` enforces this in `npm run lint`.

## Code style

- [standard](https://standardjs.com/): no semicolons, 2-space indent.
- Minimal and correctness-focused. No defensive code, no try/catch around calls that can't throw, no validation beyond what's needed.
- `const` by default; `let` only in loops.
- Avoid polymorphism. Classes for data shape (stable hidden classes in V8), not method dispatch. The only approved use of methods is when two classes implement the same signature differently (duck-typed dispatch).
- Export factory functions (`createFoo(...)`), never classes. Class names don't survive mangling, factory names do. Consumers must never write `new ClassName()`.

## Tree-shaking

`sideEffects: false` in `package.json` is the primary mechanism. Two additional rules:

- Top-level conditional initializers defeat DCE. Wrap them in a `/* @__PURE__ */`-annotated IIFE:
  ```js
  export const x = /* @__PURE__ */ (() => cond ? A : B)()
  ```
  `/* @__PURE__ */` binds only to a `CallExpression` or `NewExpression` — before a ternary, parenthesized expression, or bare identifier it's silently a no-op. Use the space-padded `@`-prefix form; `/*#__PURE__*/` fails `standard`'s `spaced-comment` rule (bundlers accept both).
- Annotate pure function *declarations* with `/* @__NO_SIDE_EFFECTS__ */` so every call site is drop-if-unused without per-call `/* @__PURE__ */`. Belt-and-braces for pipelines that ignore `sideEffects: false` (notably React Native / Metro).

## Don't

- Don't add `.ts` files, a bundler, or a build step for `src/` — published files are the source.
- Don't add polyfills or runtime feature-detection — use conditional exports for cross-environment modules.
- Don't replace factory functions with exported classes for "ergonomics".
- Don't add semicolons to match "normal" JS — `standard` fails the lint.
