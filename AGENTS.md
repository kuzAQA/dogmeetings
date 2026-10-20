#

# Agent rules

- Prefer Serena semantic/symbol tools over full-file reads.
- Search before reading; read only relevant symbols/snippets.
- Do not repeatedly inspect unchanged files.
- Make minimal behavior-preserving changes.
- Prefer simplification/deletion over new abstractions.
- Run the narrowest relevant checks after changes.
- Inspect git diff before finishing.

# Menu card chevrons

- Show a right chevron (`>`) only on cards that navigate to a separate page or screen.
- Do not show it on cards that open a modal, bottom sheet, popover, or perform an action on the current page. Apply this consistently to shared menu components and their informational examples.
- Keep the chevron in its existing position on navigation cards; it is an indicator within the card, not a separate button.

# Production VDS

- VDS update 2026-10-20 applied the one-time Telegram dialog notification backfill from `docs/superpowers/plans/2026-10-20-telegram-dialog-backfill.md`. Both verified client links are enabled; 6 of 8 active chats have no proven client_id link after checking retained intents and available backups. Keep the plan partially complete until those links are recovered through the existing Telegram confirmation flow; do not invent links, re-run the backfill after user opt-outs, or message subscribers without authorization. See the plan for backup and validation results.

- Use the new VDS at `185.75.189.36`, SSH user `root`, port `22`.
- Update only this VDS. The old VDS is shut down and must not be accessed.
- The local SSH private key is `/Users/ikuznetsov/.ssh/dogmeet_ed25519` (`~/.ssh/dogmeet_ed25519`). Never copy or expose its contents.
- Connect with `ssh -i /Users/ikuznetsov/.ssh/dogmeet_ed25519 root@185.75.189.36`. The project directory is `/opt/dogmeet`; the public site is `https://dogmeet.ru`.
- Reuse these connection details for subsequent VDS updates without asking again unless the user changes them or the connection fails.
- Before updates, inspect the server checkout and preserve local server changes. The VDS has local Caddy changes for the clipboard service; do not overwrite them as part of app updates.
