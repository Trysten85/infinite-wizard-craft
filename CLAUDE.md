# Infinite Wizard Craft

Several Claude sessions work in this one working tree at the same time. Before starting work:

1. Read `Work Board.md`. It lists what each session is building and which lane owns which files.
2. Claim a ticket from your lane before you start it, and mark it done when you finish.
3. Read the guide a ticket names. `Town Guide.md` is the design for days and the town; the
   README lists the others.

## Standing rules

- **Code owns rules and numbers; the model writes words.** Never let model output decide a reward,
  a quality, or whether something is allowed.
- **Every balance number lives in `config/balance.json`.** Game content lives in `data/`, checked
  by a schema in `src/shared/schema.ts`.
- **Write a test for every rule.** `npm test` and `npm run typecheck` must pass before you call a
  ticket done.
- **Stay in your lane's files.** When you must touch a shared file, make small exact edits so
  another session's lines are not overwritten.
- **You do not commit. Ever.** One session (the commit bot) owns every commit. Finish your
  ticket, make `npm test` and `npm run typecheck` pass, leave the files in the tree, and set the
  ticket to `done, unreviewed` with a Notes line saying what landed and which files. Then stop.
  Do not run `git commit`, `add`, `merge`, `rebase`, `reset`, or `stash`. A Bash hook
  (`.claude/hooks/git-guard.py`) refuses those and the other commands that write history or
  discard work in the tree. Reads (`status`, `diff`, `log`, `show`) stay open.
- **The dev server reloads rule changes onto the real save.** Back up `var/game.db` before
  changing progression, and try new rules on a copy with a made-up player.
- **Source nvm before `npm` or `tsx`.** The system Node is too old to run the server.
- **Keep the top of `Work Board.md` ("At a glance") current, in plain words.** Trysten reads that
  section only. Ticket codes (N3a, A4, B5) are for sessions, and never stand alone there.
- **Keep things swappable ("Candle Gate", `Process.md`).** Code names say what a thing does, not
  what the fiction calls it; player-facing words live in one data file or constant; no timing or
  number in code; renames start from a green commit and go through the typecheck.
- Questions about the design go under "Questions for design" in `Work Board.md`.
- **Shell output goes through RTK**, a token filter hooked on Bash (installed 2026-10-15). It
  condenses `git`, `grep`, `find`, `ls`, and test output. Watch for edge cases: truncated or
  grouped `grep` and `git diff` output, test runs that show only failures, piped or chained
  commands, and output you must parse exactly. If a result is empty, garbled, or contradicts its
  exit code, rerun it as `rtk bypass <cmd>` before trusting it, and report the case to Trysten.
