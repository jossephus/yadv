import { commentLocationLabel, type LocalDiffComment } from "../../localComments.js"
import { colors } from "../colors.js"
import { commentDisplayRows, CommentSegmentsLine } from "../comments.js"
import { fitCell, HintRow, PlainLine, StandardModal, standardModalDims } from "../primitives.js"
import type { CommentsOverviewModalState } from "./types.js"

export const CommentsOverviewModal = ({
	state,
	comments,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CommentsOverviewModalState
	comments: readonly LocalDiffComment[]
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const countText = comments.length === 1 ? "1 comment" : `${comments.length} comments`
	const selectedIndex = comments.length === 0 ? 0 : Math.max(0, Math.min(state.selectedIndex, comments.length - 1))

	// Each comment becomes a small block (location/meta line + body rows + a
	// trailing blank separator), tagged with its comment index so we can scroll
	// the selected block into view and highlight all of its rows.
	const rows = comments.flatMap((comment, index) => {
		const block = commentDisplayRows({ item: comment, width: contentWidth, markerLabel: commentLocationLabel(comment) }).map((row) => ({ ...row, commentIndex: index }))
		return index === comments.length - 1 ? block : [...block, { key: `${comment.id}:gap`, segments: [], commentIndex: index }]
	})

	const firstSelectedRow = rows.findIndex((row) => row.commentIndex === selectedIndex)
	const lastSelectedRow = rows.length - 1 - [...rows].reverse().findIndex((row) => row.commentIndex === selectedIndex)
	const maxScroll = Math.max(0, rows.length - bodyHeight)
	const desiredScroll = lastSelectedRow - bodyHeight + 1 > 0 ? lastSelectedRow - bodyHeight + 1 : firstSelectedRow
	const scrollOffset = Math.max(0, Math.min(firstSelectedRow, Math.min(maxScroll, Math.max(0, desiredScroll))))
	const visibleRows = rows.slice(scrollOffset, scrollOffset + bodyHeight)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Comments"
			headerRight={{ text: countText }}
			subtitle={null}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "move" },
						{ key: "y", label: "copy all" },
						{ key: "d", label: "delete" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{comments.length === 0 ? (
				<PlainLine text={fitCell("No comments yet. Press enter on a diff line to add one.", contentWidth)} fg={colors.muted} />
			) : (
				visibleRows.map((row) => <CommentSegmentsLine key={row.key} segments={row.segments} {...(row.commentIndex === selectedIndex ? { bg: colors.selectedBg } : {})} />)
			)}
		</StandardModal>
	)
}
