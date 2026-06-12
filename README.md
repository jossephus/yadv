# yadv

Yet Another Local Diff Viewer, a fork of [ghui](https://github.com/kitlangton/ghui) for local diffs. because ghui is soo nice to work with.

## Keybindings

- `up` / `down`: move selection
- `k` / `j`: move selection
- `gg` / `G`: jump to first or last pull request
- `ctrl-u` / `ctrl-d`: page up or down
- `tab` / `shift-tab`: switch PR queue
- `ctrl-p` / `cmd-k`: open the command palette
- `/`: filter
- `enter`: expand details; normal PR actions still work while details are expanded
- `esc`: return from expanded details, leave diff/comment mode, or close modal
- `r`: refresh
- `d`: view stacked diff for all changed files
- `shift-r`: review or approve the selected pull request
- `up` / `down` / `pageup` / `pagedown`: move comment target while viewing a diff
- `enter`: open a commented diff line, or start a comment on an uncommented line
- `v`: start or clear a multi-line diff comment range
- `n` / `p`: jump between diff comment threads
- `f`: open the changed-files navigator while viewing a diff
- `left` / `right`: choose the deleted or added side while in split diff comment mode
- `[` / `]`: switch files while viewing or commenting on a diff
- `s`: toggle draft or ready-for-review state
- `m`: merge
- `x`: close with confirmation
- `t`: choose a fixed theme, including `System` to match your terminal colors; press `m` in the theme picker to follow the OS light/dark appearance with separate theme choices
- `l`: manage labels
- `o`: open PR in browser
- `y`: copy PR metadata
- `q`: quit

Review submission:

- Press `shift-r` to open the review modal.
- Use `j` / `k` or `up` / `down` to choose Comment, Approve, or Request changes.
- Press `enter` to move to the optional summary area.
- Press `enter` again to submit, or `shift-enter` to insert a newline.
- Press `esc` from the summary to return to action selection; press `esc` from action selection to cancel.

## Credits

- Forked from [ghui](https://github.com/kitlangton/ghui) by Kit Langton.
