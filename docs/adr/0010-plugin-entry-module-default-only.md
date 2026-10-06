# Plugin entry module default-only

> **Superseded mechanism (ADR-0012, v2-native).** The loader behavior
> described below — every function-valued export invoked as a factory,
> `Cannot call a class constructor … without |new|`, `Plugin export is not a
> function` — is the **v1** loader and no longer applies. Under the v2
> contract the entry must default-export a plugin definition
> `{ id, effect }` / `{ id, setup }`; anything else fails loading with
> "Plugin must export a default definition with an id and an effect or setup
> function" (per opencode-v2-facts §2). The default-only rule stands — and is
> now schema-enforced rather than convention-enforced; checklist item E3 is
> rewritten accordingly.

OpenCode's plugin loader treats every function-valued export of a plugin's
entry module as a plugin factory and invokes it as a plain call:
`hooks.push(await server(input, options))` over `Object.values(mod)`. A
class is `typeof "function"` in JavaScript, so a named class re-export from
the entry module is invoked without `new` and JavaScriptCore aborts the
entire plugin with `Cannot call a class constructor … without |new|`; any
non-function export fails instead with `Plugin export is not a function`.
Either way the loader keeps no partial result — zero hooks, zero agents.

This shipped as the v0.8.0 regression: `index.ts` re-exported the named
`OpencodeArchitectPlugin` class (added for CLI/test import ergonomics in the
dispatch-shim refactor), and every consumer session — npm-installed or local
`file://` — failed to load the suite. The contract is therefore: **the
package entry module exports `default` and nothing else**, and `default` is
the plugin factory. The hook class lives in its own module
(`src/plugin.ts`);
the CLI and tests import it from there. The regression test
`tests/entry-exports.test.ts` imports the entry and asserts the export set
and that `default` is callable without `new`, and the conformance checklist
carries E3 so generated packages inherit the same rule (their templates
already emit default-only entries).

## Considered Options

- Named class re-export from the entry for ergonomic imports (rejected):
  this was v0.8.0's regression — the loader calls it without `new` and the
  whole plugin fails to load
- Exporting a bound wrapper or instance instead of the class (rejected): any
  extra function export is still invoked with plugin input and its return
  value pushed into the hooks list, so the behavior stays wrong even when it
  no longer throws
- Switching the default export to the v1 plugin shape (`{ id, server() }`)
  (rejected for now): the loader's detect mode accepts it, but it changes
  the deployment model for generated packages and buys nothing toward this
  bug
- Requesting an upstream loader change to skip non-`default` exports (not
  actionable): multi-plugin modules are supported by design, and consumers
  on released OpenCode versions need the package to load regardless

## Consequences

- Entry-module changes are contract changes: `index.ts` may grow only the
  `import.meta.main` CLI shim, never new exports
- The class stays public to this repo (the load-hook tests) via
  `src/plugin.ts`; it is not part of the importable package surface
- The entry-exports regression test is load-bearing and must keep importing
  the real entry module rather than a re-implemented copy
- E3 in the conformance checklist audits generated packages against the
  same rule; the templates remain default-only
