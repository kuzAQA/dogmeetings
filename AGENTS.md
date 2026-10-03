#

# Agent rules

- Prefer Serena semantic/symbol tools over full-file reads.
- Search before reading; read only relevant symbols/snippets.
- Do not repeatedly inspect unchanged files.
- Make minimal behavior-preserving changes.
- Prefer simplification/deletion over new abstractions.
- Run the narrowest relevant checks after changes.
- Inspect git diff before finishing.

# Production VDS

- Use the new VDS at `185.75.189.36`, SSH user `root`, port `22`.
- Update only this VDS. The old VDS is shut down and must not be accessed.
- The local SSH private key is `/Users/ikuznetsov/.ssh/dogmeet_ed25519` (`~/.ssh/dogmeet_ed25519`). Never copy or expose its contents.
- Connect with `ssh -i /Users/ikuznetsov/.ssh/dogmeet_ed25519 root@185.75.189.36`. The project directory is `/opt/dogmeet`; the public site is `https://dogmeet.ru`.
- Reuse these connection details for subsequent VDS updates without asking again unless the user changes them or the connection fails.
- Before updates, inspect the server checkout and preserve local server changes. The VDS has local Caddy changes for the clipboard service; do not overwrite them as part of app updates.
