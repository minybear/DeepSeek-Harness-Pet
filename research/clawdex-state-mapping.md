# State mapping: Claude Code events → Codex pet rows

The Codex pet atlas defines exactly nine animation rows. Claude Code emits a
larger set of hook events. This doc records how `clawdex-hook` collapses the
hook stream onto the nine rows, and why.

The fixed row layout (from
[openai/skills `animation-rows.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)):

| Row | State          | Cols | Pet authors describe it as           |
| --- | -------------- | ---- | ------------------------------------ |
|  0  | idle           | 6    | neutral breathing/blinking loop      |
|  1  | running-right  | 8    | locomotion to the right              |
|  2  | running-left   | 8    | locomotion to the left               |
|  3  | waving         | 4    | greeting / attention gesture         |
|  4  | jumping        | 5    | anticipation, lift, peak, settle     |
|  5  | failed         | 8    | error / sad / deflated reaction      |
|  6  | waiting        | 6    | patient idle variant                 |
|  7  | running        | 6    | generic / front-facing run loop      |
|  8  | review         | 6    | focused / inspecting / thinking loop |

## Mapping

| Claude Code event       | Row | Mode      | Why                                                     |
| ----------------------- | --- | --------- | ------------------------------------------------------- |
| `SessionStart`          |  3  | transient | wave hello once, then idle                              |
| `UserPromptSubmit`      |  8  | sticky    | "review" reads as thinking; held until next event       |
| `PreToolUse` (Bash/Edit/Write/MultiEdit/NotebookEdit) | 7 | sticky | active work — generic run loop |
| `PreToolUse` (Read/Grep/Glob/WebFetch/WebSearch)      | 8 | sticky | searching/reading is "review", not running |
| `PreToolUse` (other)    |  7  | sticky    | safe default for unknown tools                          |
| `PostToolUse`           | -1  | release   | clear sticky lock, let next event pick                  |
| `Notification`          |  6  | sticky    | permission prompt — pet visibly waits                   |
| `Stop`, `SubagentStop`  |  3  | transient | wave goodbye / done                                     |
| `PreCompact`            |  8  | sticky    | reviewing/condensing — fits "review"                    |

## Modes

- **transient** — daemon plays the row through its natural duration once, then
  returns to idle. Used for hello/goodbye gestures.
- **sticky** — daemon holds this row until another sticky event arrives or a
  release is sent. Used for ongoing states (thinking, working).
- **release** — clears any sticky lock without forcing a new state. Daemon
  drops back to idle, but does not interrupt a transient that is still playing.

## What we deliberately don't do

- **No `failed` (row 5) on PostToolUse non-zero exit.** Claude Code routinely
  runs commands that fail as a normal part of an iteration loop (e.g. `make
  test` while debugging). Showing a sad pet every time would be noise. Row 5
  is reserved for terminal session failure — wired up later if a clear signal
  exists.
- **No `jumping` (row 4) yet.** Jumping reads as celebration, but Claude Code
  has no built-in "task succeeded" hook that's distinct from `Stop`. Reserved
  for future explicit success signals (e.g. a user-defined command).
- **No automatic `running-right` / `running-left` swap.** The daemon may
  alternate between rows 1 and 2 as a decorative idle behaviour after long
  inactivity. The hook layer never targets them directly.
