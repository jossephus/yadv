import type { LocalDiffComment } from "../../localComments.js"
import { colors } from "../colors.js"
import { commentDisplayRows, CommentSegmentsLine } from "../comments.js"
import { fitCell, HintRow, PlainLine, StandardModal, standardModalDims } from "../primitives.js"
import type { CommentThreadModalState } from "./types.js"

export const CommentThreadModal = ({ state, anchorLabel, comments, modalWidth, modalHeight, offsetLeft, offsetTop }: { state: CommentThreadModalState; anchorLabel: string; comments: readonly LocalDiffComment[]; modalWidth: number; modalHeight: number; offsetLeft: number; offsetTop: number }) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const countText = comments.length === 1 ? "1 comment" : `${comments.length} comments`
	const rows = comments.flatMap((comment) => commentDisplayRows({ item: comment, width: contentWidth }))
	const maxScroll = Math.max(0, rows.length - bodyHeight)
	const scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll))
	const visibleRows = rows.slice(scrollOffset, scrollOffset + bodyHeight)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Thread"
			headerRight={{ text: countText }}
			subtitle={<PlainLine text={fitCell(anchorLabel, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={<HintRow items={[{ key: "↑↓", label: "scroll" }, { key: "enter", label: "comment" }, { key: "esc", label: "close" }]} />}
		>
			{visibleRows.length === 0 ? <PlainLine text={fitCell("No comments on this line.", contentWidth)} fg={colors.muted} /> : visibleRows.map((row) => <CommentSegmentsLine key={row.key} segments={row.segments} />)}
		</StandardModal>
	)
}
