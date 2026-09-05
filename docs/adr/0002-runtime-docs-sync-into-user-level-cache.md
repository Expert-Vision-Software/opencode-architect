Status: Superseded by 0003

# Runtime docs sync into a user-level cache

OpenCode documentation is fetched at runtime — from the opencode.ai sitemap
plus two Claude prompt-engineering docs — into
`~/.cache/opencode/opencode-architect/docs`, at plugin startup and on demand,
rather than vendored into the package. This keeps agent citations current with
OpenCode's moving API at the cost of a network dependency at startup; sync
failures surface as a toast, and agents degrade gracefully. The cache path is
baked into every agent's prompt, so relocating it later means touching the
whole suite.
