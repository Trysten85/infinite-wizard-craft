#!/usr/bin/env python3
"""PreToolUse hook on Bash: only the commit bot may write git history.

Every session in this tree reads the project settings, so the rule is keyed on the commit bot's
session id, held in var/commit-bot-session (gitignored). See "Commit and review" in Work Board.md.
"""
import json
import os
import re
import shlex
import sys

SENTINEL_NAME = "commit-bot-session"

DENIED = {
    # history writes named in the commit rule
    "commit", "add", "merge", "rebase", "reset", "revert", "cherry-pick", "stash", "tag", "push",
    # also write history, or wipe other sessions' uncommitted work in the shared tree
    "pull", "am", "rm", "mv", "checkout", "restore", "switch", "clean", "update-ref", "commit-tree",
}

# git global options that take a separate value: `git -C dir commit`
OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}

SEPARATORS = re.compile(r"&&|\|\||[;|&\n()`]|\$\(")


def git_subcommands(command):
    """Yield the subcommand of every `git` call found in a shell command line."""
    for part in SEPARATORS.split(command):
        try:
            tokens = shlex.split(part, comments=True)
        except ValueError:
            tokens = part.split()
        for i, tok in enumerate(tokens):
            if os.path.basename(tok) != "git":
                continue
            j = i + 1
            while j < len(tokens) and tokens[j].startswith("-"):
                j += 2 if tokens[j] in OPTS_WITH_VALUE else 1
            if j < len(tokens):
                yield tokens[j]


def deny(message):
    print(message, file=sys.stderr)
    sys.exit(2)


def main():
    try:
        payload = json.load(sys.stdin)
        command = payload["tool_input"]["command"]
        session = payload.get("session_id", "")
    except Exception:
        sys.exit(0)  # not a payload we understand; never block unrelated commands

    project = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    try:
        with open(os.path.join(project, "var", SENTINEL_NAME)) as f:
            bot = f.readline().strip()
    except OSError:
        bot = ""
    if bot and session == bot:
        sys.exit(0)

    if SENTINEL_NAME in command:
        deny(f"Only Trysten sets {SENTINEL_NAME}, from his own terminal. "
             f"This session is {session}.")

    for sub in git_subcommands(command):
        if sub in DENIED:
            deny(f"Refused: `git {sub}`. Only the commit bot commits (CLAUDE.md; Work Board.md, "
                 f"\"Commit and review\"). Leave your files in the tree, set the ticket to "
                 f"`done, unreviewed`, and stop. This session is {session}.")
    sys.exit(0)


if __name__ == "__main__":
    main()
