import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface ChangedFilesModalCtx {
	readonly vimModeEnabled: boolean
	readonly vimInsertMode: boolean
	readonly hasResults: boolean
	readonly closeModal: () => void
	readonly selectFile: () => void
	readonly moveSelection: (delta: -1 | 1) => void
	readonly enterInsertMode: () => void
	readonly leaveInsertMode: () => void
}

const ChangedFiles = context<ChangedFilesModalCtx>()

export const changedFilesModalKeymap = ChangedFiles(
	{ id: "changed-files.escape-vim", title: "Close", keys: ["escape"], when: (s) => !s.vimModeEnabled || !s.vimInsertMode, run: (s) => s.closeModal() },
	{ id: "changed-files.leave-insert", title: "Normal mode", keys: ["escape"], when: (s) => s.vimModeEnabled && s.vimInsertMode, run: (s) => s.leaveInsertMode() },
	{ id: "changed-files.insert", title: "Insert mode", keys: ["i"], when: (s) => s.vimModeEnabled && !s.vimInsertMode, run: (s) => s.enterInsertMode() },
	...selectionModalBindings<ChangedFilesModalCtx>({
		id: "changed-files",
		cancelTitle: "Close",
		cancelKeys: ["ctrl+c"],
		close: (s) => s.closeModal(),
		confirm: {
			title: "Jump to file",
			enabled: (s) => (s.hasResults ? true : "No matching files."),
			run: (s) => s.selectFile(),
		},
		move: (s, delta) => s.moveSelection(delta),
	}),
)
