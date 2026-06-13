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

export const commentLocationLabel = (comment: LocalDiffComment) => {
	const side = comment.side === "LEFT" ? "old" : "new"
	const range = comment.startLine !== undefined && comment.startLine !== comment.line ? `${Math.min(comment.startLine, comment.line)}-${Math.max(comment.startLine, comment.line)}` : `${comment.line}`
	return `${comment.path}:${range} (${side})`
}

export const formatCommentsForClipboard = (comments: readonly LocalDiffComment[]) =>
	JSON.stringify({
		version: 1,
		comments: comments.map((comment) => ({
			id: comment.id,
			path: comment.path,
			line: comment.line,
			side: comment.side,
			author: comment.author,
			body: comment.body,
			createdAt: comment.createdAt?.toISOString() ?? null,
			inReplyTo: comment.inReplyTo,
			...(comment.startLine === undefined ? {} : { startLine: comment.startLine }),
			...(comment.startSide === undefined ? {} : { startSide: comment.startSide }),
		})),
	})
