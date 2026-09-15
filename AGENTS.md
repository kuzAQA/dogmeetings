#

# Agent rules

- Prefer Serena semantic/symbol tools over full-file reads.
- Search before reading; read only relevant symbols/snippets.
- Do not repeatedly inspect unchanged files.
- Make minimal behavior-preserving changes.
- Prefer simplification/deletion over new abstractions.
- Run the narrowest relevant checks after changes.
- Inspect git diff before finishing.
