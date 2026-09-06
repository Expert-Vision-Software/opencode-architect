# Bundled templates resolved like references

The packager and publisher need scaffolding files (plugin entry, package
manifests, CLI, installer) to render generated packages from. Shipping them
as `@assets/...` pointers broke in every deployed mode: nothing rewrote the
paths, and consumer projects have no `assets/` directory. Templates join the
mechanism ADR 0003 built for references: they are bundled under
`assets/templates/`, agent prompts address them with backtick-quoted paths
relative to the agent markdown file's own directory (for example
`../templates/cli.template.txt`), and the same two resolvers that map
references now also map templates. Copy installs place them at
`<scope base>/opencode-architect/templates/`, manifest-tracked like
references; plugin installs resolve them to absolute paths inside the
installed package. Inlining template content into the agent bodies was
rejected: it duplicates ten files' worth of content across two prompts and
forfeits the single source of truth the assets directory provides. Computing
npm-style package paths at runtime was rejected as the same rewriting
machinery with an extra indirection.

## Consequences

- The copy-install payload grows: agents, references, and templates.
- Generated packages keep their scaffolding in step with the suite's current
  best shape, since packager and publisher read the same bundled sources.
- One authoring convention covers both bundled classes: backtick-quoted,
  relative-to-file paths with forward slashes.
