# Startup non-interference: load-time hooks degrade, never throw

Generated packages and this suite's own plugin treat OpenCode's launch as
inviolable: every hook — especially the `config` hook that performs
load-time installation — wraps its work so that any failure becomes a
structured warning plus at most one advisory toast, after which the hook
returns and startup proceeds with whatever in-memory config work (agent
injection, permission defaults) succeeded. Hard errors are reserved for the
CLI (`install`, `status`, `uninstall`), where a failure is visible and
retryable. Supporting this, registration detection reads every consumer
config format in use (`opencode.json` and `opencode.jsonc`, global and
project) — a plugin entry in a format the detector ignores silently reads
as "not registered" — and an absent-`assets/` condition at load is treated
as a partial npm cache artifact (which OpenCode reuses indefinitely without
repair): the advisory names the exact cache directory to remove, and the
publish checklist verifies the tarball ships assets via `npm pack --dry-run`.

## Considered Options

- Fail-fast hooks that throw on unexpected state (rejected): a rejection
  during config assembly propagates into config loading and the npm-install
  and import waits have no timeout — either can stall startup with no UI
  escape, forcing the user to kill the shell; observed in practice with
  `opencode-auto-qcgates` registered via config entry
- Trusting `import.meta.dirname`-based asset presence as proof of a healthy
  install (rejected): OpenCode imports npm plugins from their real cached
  directory, so paths normally resolve — but a partial cache extraction
  passes the path checks while missing bundled assets, so the state must be
  handled, not assumed impossible
- Only reading `opencode.json` for registration (rejected): consumers
  legitimately use `opencode.jsonc`; detection that skips a format silently
  misreports scope and skips self-ensure
- Auto-deleting a suspect cache directory from the hook (deferred): a plugin
  mutating OpenCode's cache mid-startup risks racing an in-flight install;
  v1 advises the exact removal command and the next start re-installs

## Consequences

- A broken, half-installed, or mis-registered package can degrade a session
  (missing skills/commands, one advisory) but can never prevent launch
- Consumers registering by config entry alone get self-ensure behavior in
  the declaring scope; `bunx <pkg> install` remains the explicit,
  manifest-visible path with the same scope discipline
- Diagnostics stay user-actionable: every load-time failure message names
  the remediation command or cache path instead of an error code
- Template conformance: the `plugin-local` template's try/catch wrapper and
  format-tolerant detection are load-bearing and must not be simplified away
