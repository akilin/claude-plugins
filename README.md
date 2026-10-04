# claude-plugins

Claude Code plugins that change how the terminal UI looks. They only change rendering: what the model sees and does is untouched.

## Install

```
/plugin marketplace add akilin/claude-plugins
/plugin install better-tool-rows@akilin-plugins
/plugin install prompt-bubbles@akilin-plugins
```

## Plugins

### better-tool-rows

Shorter, quieter tool rows.

- **Read / Edit / Write** show the file path relative to the folder Claude Code was started in (the link behind it still holds the full path, so ctrl+click opens it from anywhere), even after Claude `cd`s elsewhere or `/cd` moves the project. Files outside the folder keep their full path. Windows paths match with either separator and in any case.
- **Edit / Write** hide the diff and put the line counts on the row instead: `Update(notes.md) +3 -1`. An edit held for review rather than written is shown as usual.
- **Bash** commands are put on one line (a multi-line command's lines are joined) and cut with `…` so `Bash(command)` always fits on one line, wide characters included.
- **Bash** commands that create or delete files list each one beneath the row with its line count (`Created notes.md +10`, `Deleted notes.md -10`) instead of a diff of all the lines each file has or had.
- **Bash** output longer than 5 lines is folded behind a clickable `▸ 12 lines`; unfolded, it shows up to 500 lines and counts the rest. If the command was cut or joined, the fold also holds the full command with syntax highlighting (`▸ command, 12 lines`); with 5 lines of output or fewer, the output stays as it is and the fold holds the command alone (`▸ command`).

### prompt-bubbles

Your own prompts are drawn as right-aligned chat bubbles (a rounded box with a cornflower-blue border, as wide as the longest line and at most three quarters of the terminal) so they stand apart from Claude's replies. Task notifications and messages from other agents or sessions keep the usual drawing, and so does the desktop app, which already has bubbles.

## Development

The repo has a dev container (Node, TypeScript and Claude Code preinstalled). It keeps Claude Code's config in a volume of its own, so logins and settings survive a rebuild, and sets VS Code's chat to auto-approve tool calls (`chat.permissions.default`), which is only safe inside the container.

From a plugin's folder (e.g. `plugins/better-tool-rows`):

```
claude plugin validate .
claude plugin test .
npx -y -p typescript tsc -p tsconfig.json
```

`tsc` needs the API types Claude Code writes to `.claude-plugin/types/` (gitignored) when it loads the plugin, so on a fresh clone load it once first, e.g. `claude --plugin-dir plugins/better-tool-rows`.
