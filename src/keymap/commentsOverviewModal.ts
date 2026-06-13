import { context } from "@ghui/keymap"

export interface CommentsOverviewModalCtx {
	readonly hasComments: boolean
	readonly closeModal: () => void
	readonly move: (delta: number) => void
	readonly copyAll: () => void
	readonly deleteSelected: () => void
}

const Overview = context<CommentsOverviewModalCtx>()

export const commentsOverviewModalKeymap = Overview(
	{ id: "comments-overview.close", title: "Close", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comments-overview.up", title: "Up", keys: ["k", "up"], run: (s) => s.move(-1) },
	{ id: "comments-overview.down", title: "Down", keys: ["j", "down"], run: (s) => s.move(1) },
	{ id: "comments-overview.copy-all", title: "Copy all", keys: ["y"], when: (s) => s.hasComments, run: (s) => s.copyAll() },
	{ id: "comments-overview.delete", title: "Delete", keys: ["d"], when: (s) => s.hasComments, run: (s) => s.deleteSelected() },
)
