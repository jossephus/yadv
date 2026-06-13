import { context } from "@ghui/keymap"
import { changedFilesModalKeymap, type ChangedFilesModalCtx } from "./changedFilesModal.ts"
import { commentModalKeymap, type CommentModalCtx } from "./commentModal.ts"
import { commentThreadModalKeymap, type CommentThreadModalCtx } from "./commentThreadModal.ts"
import { commentsOverviewModalKeymap, type CommentsOverviewModalCtx } from "./commentsOverviewModal.ts"
import { commandPaletteKeymap, type CommandPaletteCtx } from "./commandPalette.ts"
import { diffViewKeymap, type DiffViewCtx } from "./diffView.ts"
import { themeModalKeymap, type ThemeModalCtx } from "./themeModal.ts"

export interface AppCtx {
	readonly changedFilesModalActive: boolean
	readonly commentModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly commentsOverviewModalActive: boolean
	readonly themeModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly textInputActive: boolean
	readonly changedFilesModal: ChangedFilesModalCtx
	readonly commentModal: CommentModalCtx
	readonly commentThreadModal: CommentThreadModalCtx
	readonly commentsOverviewModal: CommentsOverviewModalCtx
	readonly themeModal: ThemeModalCtx
	readonly commandPalette: CommandPaletteCtx
	readonly diff: DiffViewCtx
	readonly openCommandPalette: () => void
	readonly handleQuitOrClose: () => void
}

const App = context<AppCtx>()

const modalActive = (a: AppCtx): boolean =>
	a.changedFilesModalActive || a.commentModalActive || a.commentThreadModalActive || a.commentsOverviewModalActive || a.themeModalActive || a.commandPaletteActive

export const appKeymap = App(
	{ id: "command.open", title: "Open command palette", keys: ["ctrl+p", "meta+k"], run: (s) => s.openCommandPalette() },
	{ id: "command.open-help", title: "Open command palette", keys: ["?"], when: (s) => !s.textInputActive, run: (s) => s.openCommandPalette() },
	{
		id: "yadv.quit-or-close",
		title: "Quit / close modal",
		keys: ["ctrl+c"],
		run: (s) => s.handleQuitOrClose(),
	},
	{
		id: "yadv.quit-or-close-q",
		title: "Quit / close modal",
		keys: ["q"],
		when: (s) => !s.textInputActive,
		run: (s) => s.handleQuitOrClose(),
	},
	changedFilesModalKeymap.scope((a) => a.changedFilesModalActive && a.changedFilesModal),
	commentModalKeymap.scope((a) => a.commentModalActive && a.commentModal),
	commentThreadModalKeymap.scope((a) => a.commentThreadModalActive && a.commentThreadModal),
	commentsOverviewModalKeymap.scope((a) => a.commentsOverviewModalActive && a.commentsOverviewModal),
	themeModalKeymap.scope((a) => a.themeModalActive && a.themeModal),
	commandPaletteKeymap.scope((a) => a.commandPaletteActive && a.commandPalette),
	diffViewKeymap.scope((a) => !modalActive(a) && a.diff),
)
