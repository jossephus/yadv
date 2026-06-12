import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface CommandPaletteCtx {
	readonly vimModeEnabled: boolean
	readonly vimInsertMode: boolean
	readonly closeModal: () => void
	readonly runSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
	readonly enterInsertMode: () => void
	readonly leaveInsertMode: () => void
}

const Palette = context<CommandPaletteCtx>()

// `k`/`j` are typeable text in the palette search field, so the vertical keys
// stick to arrows + emacs-style ctrl chords.
export const commandPaletteKeymap = Palette(
	{ id: "palette.escape-vim", title: "Close palette", keys: ["escape"], when: (s) => !s.vimModeEnabled || !s.vimInsertMode, run: (s) => s.closeModal() },
	{ id: "palette.leave-insert", title: "Normal mode", keys: ["escape"], when: (s) => s.vimModeEnabled && s.vimInsertMode, run: (s) => s.leaveInsertMode() },
	{ id: "palette.insert", title: "Insert mode", keys: ["i"], when: (s) => s.vimModeEnabled && !s.vimInsertMode, run: (s) => s.enterInsertMode() },
	...selectionModalBindings<CommandPaletteCtx>({
		id: "palette",
		cancelTitle: "Close palette",
		cancelKeys: ["ctrl+c"],
		close: (s) => s.closeModal(),
		confirm: { title: "Run command", run: (s) => s.runSelected() },
		move: (s, delta) => s.moveSelection(delta),
		verticalKeys: { up: ["up", "ctrl+p", "ctrl+k"], down: ["down", "ctrl+n", "ctrl+j"] },
	}),
)
