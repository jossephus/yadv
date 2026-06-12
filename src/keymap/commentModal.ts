import { context } from "@ghui/keymap"

export interface CommentModalCtx {
	readonly vimModeEnabled: boolean
	readonly vimInsertMode: boolean
	readonly closeModal: () => void
	readonly submitComment: () => void
	readonly enterInsertMode: () => void
}

const Comment = context<CommentModalCtx>()

export const commentModalKeymap = Comment(
	{ id: "comment.escape", title: "Cancel", keys: ["escape"], when: (s) => !s.vimModeEnabled || !s.vimInsertMode, run: (s) => s.closeModal() },
	{ id: "comment.save", title: "Save comment", keys: ["escape"], when: (s) => s.vimModeEnabled && s.vimInsertMode, run: (s) => s.submitComment() },
	{ id: "comment.insert", title: "Insert mode", keys: ["i"], when: (s) => s.vimModeEnabled && !s.vimInsertMode, run: (s) => s.enterInsertMode() },
)
