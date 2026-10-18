# How this project is built

Infinite Wizard Craft is a browser game: a cozy, funny, non-violent crafting game where you
combine elements and materials to discover spells, items, and jobs, then build a town and live
out in-game days. It takes the genres this project's author likes most — fantasy RPGs and the
tabletop games they came from — and tries to give them more depth than a combine-two-things
browser game usually has.

It is also an experiment in how it is made. Trysten owns the shape of the project: the file
structure, the design, what gets built next, and whether a thing is good. Several Claude Code
sessions own the syntax. He does not write the TypeScript, and they do not decide the game.

This doc is the process. The game's design is in `Infinite Wizard Craft.md` and `Town Guide.md`;
the current work is in `Work Board.md`; the standing rules every session must follow are in
`CLAUDE.md`.

## The division of labour

| Trysten owns | The sessions own |
|---|---|
| File and folder structure, what a doc is called, what lives where | The contents of the code files |
| The design: rules, numbers, tone, what the game is | Expressing a settled rule in TypeScript, and its tests |
| What gets built next, and in what order | Finishing the ticket they claimed |
| Operations: the machine, Node, Ollama, the save file, backups | Making `npm test` and `npm run typecheck` pass |
| The verdict: is this fun, is this right | Reporting honestly when it isn't done |

The rule underneath it: **code owns rules and numbers; the model writes words.** No model output
ever decides a reward, a quality, or whether something is allowed. The model names things,
writes flavour, and judges borderline combinations. Everything a player could feel cheated by is
computed in code and covered by a test.

## Several sessions, one working tree

Four or five Claude sessions work in the same checkout at the same time. There are no branches
per session — they would have to be merged by hand, and a session cannot be trusted to remember
which branch it is on across a restart. Instead the tree is divided by **lane**: each session
owns a set of files and does not touch the others. The lane table lives in `Work Board.md`.

This trades merge conflicts for a coordination problem, and the board is the answer to it. A
session claims a ticket on the board before starting, writes down what landed when it finishes,
and asks design questions in writing at the bottom of the board rather than guessing. Sessions
do not message each other except for what cannot go on the board, because a message is lost when
a session restarts and the board is not.

## From finished work to a commit

Work reaches history through three hands, which is the one place this project is deliberately
slower than it needs to be.

1. **The owner** builds the ticket, makes the tests and typecheck pass, leaves the files in the
   tree, sets the ticket to `done, unreviewed`, and stops. It does not commit and does not
   review itself.
2. **The review bot** reads the change, fixes what it finds, and adds a row to "Ready to commit"
   on the board. It does not commit either.
3. **The commit bot** checks that nobody is still writing to the tree, re-runs the tests and
   typecheck, stages exactly the files the row names, writes the message, commits, and puts the
   SHA in the ticket's Notes.

Why it is shaped this way: when every session committed its own work, history filled with
commits that said what a ticket was called and not what changed or why, and a few landed work
that another session was still editing. A single committer makes every commit a deliberate act
by something whose only job is the quality of the history.

Written rules were not enough to hold it, because a session already running keeps the old
`CLAUDE.md` in its context until it restarts. So `.claude/hooks/git-guard.py` enforces it: a
`PreToolUse` hook on Bash that refuses `commit`, `add`, `merge`, `rebase`, `reset`, `push`, and
the rest of the commands that write history or throw away another session's uncommitted work. It
allows all of them for one session id, kept in `var/commit-bot-session`, which is gitignored and
written only by Trysten from his own terminal. Reads — `status`, `diff`, `log`, `show` — stay
open to everyone, because a session needs to see the tree to work in it.

The hook is a safety net, not the rule. The rule is in `CLAUDE.md`.

## What a commit looks like here

A commit should be readable a year from now by someone who was not in the conversation. The
reasoning is the valuable part: the code says what it does, and only the message can say what it
was doing before, what was wrong with that, and how we concluded this was the fix.

**Subject:** the area or ticket, a colon, then what changed in plain words. Under 72 characters,
no trailing full stop.

```
E3 review: the page stops naming game content by id
Order text: model-written orders held against the board, no repeated subject
```

**Body:** what was wrong, what changed, and why that is the right shape. Wrapped at about 88
characters. Concrete numbers beat adjectives — "12 of 20 seeds repeated a subject" tells the
next reader more than "the dedupe was unreliable". Several unrelated findings in one commit get
a paragraph each. If a decision was deliberately left undone, the body says so and why.

**One commit, one change.** Two unrelated edits to the same file are two commits, staged apart
with `git add -p`. A commit that needs the word "and" twice in its subject is usually two.

**Attribution.** Commits are not tagged with a "made by Claude" trailer. The arrangement is
written down here and in `CLAUDE.md`, in public, which is a better record than a line repeated
on every commit. Commits made before 2026-10-17 carry a `Co-Authored-By: Claude` trailer; they
are left exactly as they are, because rewriting them would change every SHA and the board refers
to commits by SHA.

## How a decision gets recorded

- A **design decision** goes in the guide it belongs to (`Town Guide.md`,
  `Infinite Wizard Craft.md`), and a line goes in the board's Log with the date.
- An **open question** goes under "Questions for design" on the board, with the ticket id. The
  session carries on with the rest of the ticket rather than guessing.
- A **balance number** goes in `config/balance.json` and nowhere else. Game content goes in
  `data/`, checked by a schema in `src/shared/schema.ts`.
- A **review finding** is written on the board with an id (`E3-1`, `A4-2`), and says whether it
  was fixed, or was deliberately not fixed and why.
- A **reason** goes in the commit message. The board says what landed; the commit says why.

## Things that bite

- **Source nvm before `npm` or `tsx`.** The system Node is too old to run the server.
- **Shell output is filtered.** RTK condenses Bash output to save tokens. It is usually faithful,
  but when a result looks empty, garbled, or at odds with its exit code, re-run it as
  `rtk bypass <cmd>` before believing it.
- **The dev server reloads rule changes onto the real save.** Back up `var/game.db` before
  changing progression and try new rules on a copy with a made-up player.
- **The tree moves under you.** Another session may be writing a file while you read it. Before
  committing, check that nothing has been touched in the last few minutes.
