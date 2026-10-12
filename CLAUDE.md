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
- **Do not commit another session's work.** Check `git status` first, and ask Trysten.
- **The dev server reloads rule changes onto the real save.** Back up `var/game.db` before
  changing progression, and try new rules on a copy with a made-up player.
- **Source nvm before `npm` or `tsx`.** The system Node is too old to run the server.
- Questions about the design go under "Questions for design" in `Work Board.md`.
