import type { ChangedFilesModalCtx } from "../changedFilesModal.ts"

export interface BuildChangedFilesModalCtxInput {
	readonly vimModeEnabled: boolean
	readonly vimInsertMode: boolean
	readonly hasResults: boolean
	readonly closeActiveModal: () => void
	readonly selectChangedFile: () => void
	readonly moveChangedFileSelection: (delta: -1 | 1) => void
	readonly enterVimInsertMode: () => void
	readonly leaveVimInsertMode: () => void
}

export const buildChangedFilesModalCtx = ({ vimModeEnabled, vimInsertMode, hasResults, closeActiveModal, selectChangedFile, moveChangedFileSelection, enterVimInsertMode, leaveVimInsertMode }: BuildChangedFilesModalCtxInput): ChangedFilesModalCtx => ({
	vimModeEnabled,
	vimInsertMode,
	hasResults,
	closeModal: closeActiveModal,
	selectFile: selectChangedFile,
	moveSelection: moveChangedFileSelection,
	enterInsertMode: enterVimInsertMode,
	leaveInsertMode: leaveVimInsertMode,
})
