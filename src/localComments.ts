import type { DiffCommentSide, PullRequestReviewComment } from "./domain.js"

export interface LocalDiffComment extends PullRequestReviewComment {
	readonly startLine?: number
	readonly startSide?: DiffCommentSide
}

export interface CreateLocalDiffCommentInput {
	readonly path: string
	readonly line: number
	readonly side: DiffCommentSide
	readonly body: string
	readonly author: string
	readonly inReplyTo: string | null
	readonly startLine?: number
	readonly startSide?: DiffCommentSide
}

export interface LocalCommentsFile {
	readonly version: 1
	readonly comments: readonly LocalDiffComment[]
}

export const initialLocalCommentsFile: LocalCommentsFile = {
	version: 1,
	comments: [],
}
