# Core module carve-out: one deep module, two adapters

The suite CLI and the generated-package CLI carried genuinely identical
machinery in parallel: name matching, entry classification and path
resolution, config reading and surgical splicing, manifest io + per-file
hashes, cache paths, and the effective-version pipeline. Templates vendored
that machinery into every scaffolded package; the sync table existed mostly
to police the resulting duplication. This ADR records the carve-out of that
machinery into one deep module, exported as a slim subpath
(`package.json` → `"exports": { "./core": "./src/core/index.ts" }`), and the
shift of templates from structural source of truth to adapter renderings.

## Design twice

### Design A — one engine, two thin shells

Core exports a single package engine (`install` / `uninstall` / `status` /
`ensureAssets`) that owns the whole flow; the suite CLI and the generated CLI
become thin renderings over a policy object
(`{packageName, payload, assetLayoutDir, consentCallback, ...}`).

- Depth: maximal at the interface (one call per operation), but the depth is
  fake — the two flows genuinely diverge (suite: legacy copy-install
  migration, agents/references/templates payload, package-broad cache
  clearing; generated: skills/commands payload, consent-gated root-config
  migration, self-scoped cache hygiene). Reconciling them forces boolean and
  callback parameters into the policy object — ad hoc parameterization at
  exactly the seam this ticket says must declare policy instead.
- Locality: every suite change ripples through the shared engine into
  generated-package behavior; the shells are thin, so divergence hides in
  flags rather than living in code.
- Seam placement: the seam is a configuration object — policy arrives as
  data, and nothing in the type system says which adapter may do what.

### Design B — machinery carve-out, adapters keep orchestration (winner)

Core exports the primitives that are genuinely identical — environment
adapter, scope bases, cache paths and cache-target removal, name normalizer,
entry predicate and path resolver, config reader, registration detector,
config splicer, plugin-config editor, manifest io + per-file sha256 hashes,
loaded-version resolver, registry version check, and the status/effective-
version pipeline (already packageName-parameterized with an injected
`ManifestLookup`). Each package keeps its own orchestration, which is where
the real policy lives, and declares that policy as named constants at the top
of its adapter (package name, payload names, asset layout, allowed cache
commands, scope coverage).

- Depth: each core module is deep in the ordinary sense — a small surface
  (a class or a function family) over a large, invariant-carrying behavior
  (ADR-0006's manifest gating, semantic entry matching, surgical splices,
  ADR-0007 never-throw hooks all live inside core, not in adapters).
- Locality: the residual divergence (suite vs generated flows) sits in two
  small adapters, and the sync table names exactly what diverges.
- Seam placement: the seam is the `opencode-architect/core` import path.
  Policy is declared in adapter code, not threaded through parameters, and
  the template sync table is the written policy of what each adapter keeps.

### Why B wins

A parameterizes what the ticket says to declare; B declares it. The
divergence manifest (references/template-sync-table.md) already names the
per-adapter policy — suite-only broad cache modes, generated-only consent-
gated migration — and B's seam makes that manifest executable: a divergence
is either an adapter-local constant or it is drift. A also couples the two
packages' release cadence at every behavior change, while B couples them
only where behavior is truly shared.

## Manifest-format compatibility rule

Before any generated package depends on the core module, the formats are
fixed as follows:

1. Core's manifest io is the generated-package format, **frozen** at the
   carve-out: `<configBase>/<package>.manifest.json` holding
   `{version, mode?, entry?, entryConfigPath?, files: Record<relPath,
   sha256>}`. Readers accept everything earlier templates wrote: a missing
   or malformed manifest reads as "not installed" (drift), a missing `mode`
   reads as `"copy"`, per-file sha256 hashes are the only idempotency
   mechanism (ADR-0006). Adopting the core dependency is not a manifest
   migration — file name, location, keys, and tolerance are unchanged.
2. The suite adapter's own manifest (`opencode-architect.manifest.json`,
   `{version, mode, entry, configPath, content-hash, hashes: [{path,
   hash}]}`) is a legacy format owned by the suite Installer; core never
   reads or writes it, and the file name is reserved.
3. The shared status pipeline is format-agnostic: it consumes manifests only
   through the injected `ManifestLookup` surface (`{mode, version}` per
   scope), so both formats feed one effective-version computation.

## Templates become adapter renderings

Templates stop being a structural source of truth. The machinery templates
(`plugin-name`, `plugin-entry`, `entry-predicate`, `manifest`,
`registration`, `plugin-config`) dissolve: their content is the core module,
and generated packages import it via the `./core` subpath of a `file:`
dependency on `opencode-architect` recorded at render time. `installer` and
`cli` templates shrink to adapter renderings — policy constants plus
orchestration over core calls — that the scaffold renderer emits.
ADR-0005's resolution mechanics (bundled assets under the installed package,
backtick-relative addressing) stand; its role for these files as the truth
source of generated-package structure is superseded by the core dependency.

## Consequences

- Machinery bugs fix once; generated packages pick them up through the
  dependency at their next install, not through re-scaffolding.
- Consumer packages gain a `file:`-based `opencode-architect` dependency;
  scaffolding and promotion must establish the local link without registry
  access (the rendered fixture proves the end-to-end path).
- The sync table loses its byte-synced machinery rows; what remains are the
  adapter renderings and their declared policies.
- `promote` inherits the new shape automatically (it renders through the
  same scaffold renderer) but must link the core dependency before running
  the generated package's install.
