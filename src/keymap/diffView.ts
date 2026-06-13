import { context } from "@ghui/keymap"
import { countedVerticalBindings } from "./helpers.ts"

export type DiffSide = "LEFT" | "RIGHT"
export type DiffAlign = "center" | "top" | "bottom"
export const diffHunkKeys = { previous: ["{"], next: ["}"] } as const

export interface DiffViewCtx {
	readonly vimModeEnabled: boolean
	readonly halfPage: number
	readonly handleEscape: () => void
	readonly openSelectedComment: () => void
	readonly openCommentsOverview: () => void
	readonly toggleRange: () => void
	readonly toggleView: () => void
	readonly toggleWrap: () => void
	readonly toggleWhitespace: () => void
	readonly reload: () => void
	readonly nextThread: () => void
	readonly previousThread: () => void
	readonly moveAnchor: (delta: number, opts?: { preserveViewportRow?: boolean }) => void
	readonly moveAnchorToBoundary: (boundary: "first" | "last") => void
	readonly alignAnchor: (align: DiffAlign) => void
	readonly selectSide: (side: DiffSide) => void
	readonly openChangedFiles: () => void
	readonly nextFile: () => void
	readonly previousFile: () => void
	readonly nextHunk: () => void
	readonly previousHunk: () => void
}

const Diff = context<DiffViewCtx>()

export const diffViewKeymap = Diff(
	{ id: "diff.escape", title: "Close modal", keys: ["escape"], run: (s) => s.handleEscape() },
	{ id: "diff.open-comment", title: "Open / add comment", keys: ["return"], when: (s) => !s.vimModeEnabled, run: (s) => s.openSelectedComment() },
	{ id: "diff.open-comment-vim", title: "Open / add comment", keys: ["i"], when: (s) => s.vimModeEnabled, run: (s) => s.openSelectedComment() },
	{ id: "diff.toggle-range", title: "Toggle comment range", keys: ["v"], when: (s) => !s.vimModeEnabled, run: (s) => s.toggleRange() },
	{ id: "diff.toggle-range-vim", title: "Toggle comment range", keys: ["shift+v"], when: (s) => s.vimModeEnabled, run: (s) => s.toggleRange() },
	{ id: "diff.toggle-view", title: "Toggle split/unified", keys: ["shift+v"], when: (s) => !s.vimModeEnabled, run: (s) => s.toggleView() },
	{ id: "diff.toggle-view-vim", title: "Toggle split/unified", keys: ["s"], when: (s) => s.vimModeEnabled, run: (s) => s.toggleView() },
	{ id: "diff.toggle-wrap", title: "Toggle wrap", keys: ["w"], run: (s) => s.toggleWrap() },
	{ id: "diff.toggle-whitespace", title: "Toggle whitespace", keys: ["shift+w"], run: (s) => s.toggleWhitespace() },
	{ id: "diff.reload", title: "Reload diff", keys: ["r"], run: (s) => s.reload() },
	{ id: "diff.comments-overview", title: "All comments", keys: ["shift+i"], run: (s) => s.openCommentsOverview() },
	{ id: "diff.next-thread", title: "Next thread", keys: ["n"], run: (s) => s.nextThread() },
	{ id: "diff.previous-thread", title: "Previous thread", keys: ["p"], run: (s) => s.previousThread() },

	// Half-page moves preserve viewport row.
	{
		id: "diff.half-up",
		title: "Half page up",
		keys: ["pageup", "ctrl+u"],
		run: (s) => s.moveAnchor(-s.halfPage, { preserveViewportRow: true }),
	},
	{
		id: "diff.half-down",
		title: "Half page down",
		keys: ["pagedown", "ctrl+d", "ctrl+v"],
		run: (s) => s.moveAnchor(s.halfPage, { preserveViewportRow: true }),
	},

	{
		id: "diff.jump-up",
		title: "Jump up",
		keys: ["shift+up", "shift+k", "meta+up", "meta+k"],
		run: (s) => s.moveAnchor(-8),
	},
	{
		id: "diff.jump-down",
		title: "Jump down",
		keys: ["shift+down", "shift+j", "meta+down", "meta+j"],
		run: (s) => s.moveAnchor(8),
	},

	...countedVerticalBindings<DiffViewCtx>((s, delta) => s.moveAnchor(delta)),

	{ id: "diff.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveAnchor(-1) },
	{ id: "diff.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveAnchor(1) },
	{ id: "diff.side-left", title: "Old side", keys: ["left", "h"], run: (s) => s.selectSide("LEFT") },
	{ id: "diff.side-right", title: "New side", keys: ["right", "l"], run: (s) => s.selectSide("RIGHT") },

	{ id: "diff.changed-files", title: "Changed files", keys: ["f"], run: (s) => s.openChangedFiles() },
	{ id: "diff.next-file", title: "Next file", keys: ["]"], run: (s) => s.nextFile() },
	{ id: "diff.previous-file", title: "Previous file", keys: ["["], run: (s) => s.previousFile() },
	{ id: "diff.next-hunk", title: "Next hunk", keys: [...diffHunkKeys.next], run: (s) => s.nextHunk() },
	{ id: "diff.previous-hunk", title: "Previous hunk", keys: [...diffHunkKeys.previous], run: (s) => s.previousHunk() },

	{ id: "diff.first", title: "First comment", keys: ["g g"], run: (s) => s.moveAnchorToBoundary("first") },
	{ id: "diff.last", title: "Last comment", keys: ["shift+g"], run: (s) => s.moveAnchorToBoundary("last") },
	{ id: "diff.align-center", title: "Align center", keys: ["z z"], run: (s) => s.alignAnchor("center") },
	{ id: "diff.align-top", title: "Align top", keys: ["z t"], run: (s) => s.alignAnchor("top") },
	{ id: "diff.align-bottom", title: "Align bottom", keys: ["z b"], run: (s) => s.alignAnchor("bottom") },
)
