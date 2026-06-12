import type { AppCommand } from "../../commands.ts"
import type { CommandPaletteCtx } from "../commandPalette.ts"

export interface BuildCommandPaletteCtxInput {
	readonly vimModeEnabled: boolean
	readonly vimInsertMode: boolean
	readonly closeActiveModal: () => void
	readonly selectedCommand: AppCommand | null
	readonly runCommandPaletteCommand: (command: AppCommand) => void
	readonly moveCommandPaletteSelection: (delta: -1 | 1) => void
	readonly enterVimInsertMode: () => void
	readonly leaveVimInsertMode: () => void
}

export const buildCommandPaletteCtx = ({
	closeActiveModal,
	vimModeEnabled,
	vimInsertMode,
	selectedCommand,
	runCommandPaletteCommand,
	moveCommandPaletteSelection,
	enterVimInsertMode,
	leaveVimInsertMode,
}: BuildCommandPaletteCtxInput): CommandPaletteCtx => ({
	vimModeEnabled,
	vimInsertMode,
	closeModal: closeActiveModal,
	runSelected: () => {
		if (selectedCommand) runCommandPaletteCommand(selectedCommand)
	},
	moveSelection: moveCommandPaletteSelection,
	enterInsertMode: enterVimInsertMode,
	leaveInsertMode: leaveVimInsertMode,
})
