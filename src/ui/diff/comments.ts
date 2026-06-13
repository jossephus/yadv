import type { LocalDiffComment } from "../../localComments.js"
import type { DiffCommentAnchor, StackedDiffCommentAnchor } from "../diff.js"
import { diffCommentAnchorLabel, diffCommentLineLabel, diffCommentLocationKey, diffCommentSideLabel } from "../diff.js"

export interface DiffCommentRangeSelection {
	readonly start: StackedDiffCommentAnchor
	readonly end: StackedDiffCommentAnchor
}

export const diffCommentThreadMapKey = (location: Pick<LocalDiffComment, "path" | "side" | "line">) => diffCommentLocationKey(location)

export const groupDiffCommentThreads = (comments: readonly LocalDiffComment[]): Record<string, LocalDiffComment[]> => {
	const threads: Record<string, LocalDiffComment[]> = {}
	for (const comment of comments) {
		const key = diffCommentThreadMapKey(comment)
		const thread = threads[key]
		if (thread) thread.push(comment)
		else threads[key] = [comment]
	}
	return threads
}

export const sameDiffCommentTarget = (left: DiffCommentAnchor, right: DiffCommentAnchor) => left.path === right.path && left.side === right.side

export const diffCommentRangeSelection = (start: StackedDiffCommentAnchor | null, end: StackedDiffCommentAnchor | null): DiffCommentRangeSelection | null => {
	if (!start || !end || !sameDiffCommentTarget(start, end)) return null
	return start.line <= end.line ? { start, end } : { start: end, end: start }
}

export const diffCommentRangeContains = (range: DiffCommentRangeSelection, anchor: StackedDiffCommentAnchor) =>
	sameDiffCommentTarget(range.start, anchor) && anchor.line >= range.start.line && anchor.line <= range.end.line

export const diffCommentRangeLabel = (range: DiffCommentRangeSelection) =>
	range.start.line === range.end.line
		? diffCommentAnchorLabel(range.end)
		: `${diffCommentSideLabel(range.end)} ${diffCommentLineLabel(range.start)}-${diffCommentLineLabel(range.end)}`
