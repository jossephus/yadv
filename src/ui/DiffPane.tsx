import type { DiffRenderable, MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import { useMemo, type MutableRefObject } from "react"
import type { LocalDiffTarget } from "../diffTarget.js"
import type { HunkStatus } from "../gitHunks.js"
import type { LocalDiffComment } from "../localComments.js"
import { colors, lineNumberTextColor, type ThemeId } from "./colors.js"
import {
	createDiffSyntaxStyle,
	diffCommentAnchorLabel,
	diffCommentLineLabel,
	diffFileStats,
	diffFileStatsText,
	type DiffFileStats,
	type DiffView,
	type DiffWhitespaceMode,
	type DiffWrapMode,
	type PullRequestDiffState,
	stackedDiffFileIndexAtLine,
	type StackedDiffCommentAnchor,
	type StackedDiffFilePatch,
} from "./diff.js"
import { LoadingPane, StatusCard } from "./DetailsPane.js"
import { CommentBodyLine, CommentSegmentsLine, commentCountText, commentMetaSegments } from "./comments.js"
import { Divider, PaddedRow, TextLine, fitCell } from "./primitives.js"

const diffTargetStatsText = (target: LocalDiffTarget, fileCount: number) => {
	const fileText = fileCount === 1 ? "1 file" : `${fileCount} files`
	const statText = diffFileStatsText(target)
	return statText ? `${fileText} ${statText}` : fileText
}

const DiffPaneHeader = ({ target, paneWidth, fileCount }: { target: LocalDiffTarget; paneWidth: number; fileCount: number }) => {
	const stats = diffTargetStatsText(target, fileCount)
	const headerWidth = Math.max(24, paneWidth - 2)
	const leftHeader = `${target.repoName}  ${target.branch}`
	const headerGap = Math.max(2, headerWidth - leftHeader.length - stats.length)
	return (
		<PaddedRow>
			<TextLine>
				<span fg={colors.text}>{target.repoName}</span>
				<span fg={colors.muted}>{`  ${target.branch}`}</span>
				<span fg={colors.muted}>{" ".repeat(headerGap)}</span>
				<span fg={colors.muted}>{fileCount === 0 ? "" : stats}</span>
			</TextLine>
		</PaddedRow>
	)
}

const FileStats = ({ stats }: { stats: DiffFileStats }) => (
	<>
		{stats.additions > 0 ? <span fg={colors.status.passing}>{`+${stats.additions}`}</span> : null}
		{stats.additions > 0 && stats.deletions > 0 ? <span fg={colors.muted}> </span> : null}
		{stats.deletions > 0 ? <span fg={colors.status.failing}>{`-${stats.deletions}`}</span> : null}
	</>
)

const hunkStatusText = (status: HunkStatus | null) => {
	if (status === "unstaged") return "  unstaged"
	if (status === "staged") return "  staged"
	if (status === "mixed") return "  mixed"
	if (status === "unknown") return "  unknown"
	return ""
}

const hunkStatusColor = (status: HunkStatus | null) => {
	if (status === "unstaged") return colors.status.review
	if (status === "staged") return colors.status.passing
	if (status === "mixed") return colors.status.draft
	if (status === "unknown") return colors.muted
	return colors.muted
}

const FileHeader = ({
	file,
	index,
	count,
	width,
	suffix = "",
	suffixColor = colors.muted,
}: {
	file: StackedDiffFilePatch["file"]
	index: number
	count: number
	width: number
	suffix?: string
	suffixColor?: string
}) => {
	const counter = `${index + 1}/${count}`
	const stats = diffFileStats(file)
	const statsText = diffFileStatsText(stats)
	const nameWidth = Math.max(1, width - counter.length - statsText.length - suffix.length - 5)
	return (
		<TextLine>
			<span fg={colors.muted}>{counter} </span>
			<span fg={colors.text}>{fitCell(file.name, nameWidth)}</span>
			{statsText ? <span fg={colors.muted}> </span> : null}
			<FileStats stats={stats} />
			{suffix ? <span fg={suffixColor}>{suffix}</span> : null}
		</TextLine>
	)
}

export const DiffPane = ({
	target,
	diffState,
	stackedFiles,
	scrollTop,
	view,
	whitespaceMode,
	wrapMode,
	paneWidth,
	height,
	loadingIndicator,
	scrollRef,
	setDiffRef,
	selectedCommentAnchor,
	selectedCommentLabel,
	selectedCommentThread,
	selectedHunkStatus,
	onSelectCommentLine,
	themeId,
	themeGeneration,
}: {
	target: LocalDiffTarget | null
	diffState: PullRequestDiffState | undefined
	stackedFiles: readonly StackedDiffFilePatch[]
	scrollTop: number
	view: DiffView
	whitespaceMode: DiffWhitespaceMode
	wrapMode: DiffWrapMode
	paneWidth: number
	height: number
	loadingIndicator: string
	scrollRef: MutableRefObject<ScrollBoxRenderable | null>
	setDiffRef: (index: number, diff: DiffRenderable | null) => void
	selectedCommentAnchor: StackedDiffCommentAnchor | null
	selectedCommentLabel: string | null
	selectedCommentThread: readonly LocalDiffComment[]
	selectedHunkStatus: HunkStatus | null
	onSelectCommentLine: (renderLine: number, side: "LEFT" | "RIGHT" | null) => void
	themeId: ThemeId
	themeGeneration: number
}) => {
	const readyFiles = diffState?._tag === "Ready" ? diffState.files : []
	const syntaxStyle = useMemo(() => createDiffSyntaxStyle(), [themeId, themeGeneration])

	if (!target) {
		return <LoadingPane content={{ title: "Loading repository", hint: "Resolving current git repository" }} width={paneWidth} height={height} />
	}

	if (!diffState || diffState._tag === "Loading") {
		return (
			<box height={height} flexDirection="column">
				<DiffPaneHeader target={target} paneWidth={paneWidth} fileCount={0} />
				<Divider width={paneWidth} />
				<LoadingPane content={{ title: `${loadingIndicator} Loading diff`, hint: "Running git diff HEAD" }} width={paneWidth} height={Math.max(1, height - 2)} />
			</box>
		)
	}

	if (diffState._tag === "Error") {
		return (
			<box height={height} flexDirection="column">
				<DiffPaneHeader target={target} paneWidth={paneWidth} fileCount={0} />
				<Divider width={paneWidth} />
				<StatusCard content={{ title: "Could not load diff", hint: diffState.error }} width={paneWidth} />
			</box>
		)
	}

	if (readyFiles.length === 0 || stackedFiles.length === 0) {
		return (
			<box height={height} flexDirection="column">
				<DiffPaneHeader target={target} paneWidth={paneWidth} fileCount={0} />
				<Divider width={paneWidth} />
				<LoadingPane
					content={{
						title: whitespaceMode === "ignore" ? "No non-whitespace diff" : "No changes",
						hint: whitespaceMode === "ignore" ? "Toggle whitespace to show hidden changes" : "Working tree matches HEAD",
					}}
					width={paneWidth}
					height={Math.max(1, height - 2)}
				/>
			</box>
		)
	}

	const stickyScrollTop = Math.max(0, Math.floor(scrollTop))
	const stickyArrayIndex = stackedDiffFileIndexAtLine(stackedFiles, stickyScrollTop)
	const stickyFile = stickyArrayIndex >= 0 ? stackedFiles[stickyArrayIndex] : stackedFiles[0]
	const incomingStickyFile = stickyArrayIndex >= 0 ? stackedFiles[stickyArrayIndex + 1] : undefined
	const incomingHeaderDistance = incomingStickyFile ? incomingStickyFile.headerLine - stickyScrollTop : Number.POSITIVE_INFINITY
	const incomingFile = incomingHeaderDistance === 1 ? incomingStickyFile : undefined
	const stickyCommentLabelFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		if (!selectedCommentAnchor) return "  no lines"
		if (selectedCommentAnchor.fileIndex !== stackedFile?.index) return ""
		return `  ${selectedCommentLabel ?? diffCommentAnchorLabel(selectedCommentAnchor)}`
	}
	const stickyCommentColor = selectedCommentAnchor?.side === "LEFT" ? colors.status.failing : colors.status.passing
	const stickyHunkLabel = hunkStatusText(selectedHunkStatus)
	const stickyHunkColor = hunkStatusColor(selectedHunkStatus)
	const stickySuffixFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		const commentLabel = stickyCommentLabelFor(stackedFile)
		return `${commentLabel}${stickyHunkLabel}`
	}
	const stickySuffixColorFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		if (selectedCommentAnchor?.fileIndex === stackedFile?.index && stickyCommentLabelFor(stackedFile)) return stickyCommentColor
		return stickyHunkColor
	}
	const diffLineNumberFg = lineNumberTextColor(colors.diff.lineNumberBg, colors.text)
	const commentPeek = selectedCommentThread.length > 0 ? selectedCommentThread[selectedCommentThread.length - 1] : null
	const commentPeekMeta =
		commentPeek && selectedCommentAnchor
			? commentMetaSegments({
					item: commentPeek,
					markerLabel: diffCommentLineLabel(selectedCommentAnchor),
					groups: [[{ text: commentCountText(selectedCommentThread.length), fg: colors.muted }]],
				})
			: []
	const handleDiffMouseDown = function (this: ScrollBoxRenderable, event: MouseEvent) {
		if (event.button !== 0) return
		const localY = event.y - this.viewport.y
		if (localY < 0 || localY >= this.viewport.height) return
		const localX = event.x - this.viewport.x
		const side = view === "split" ? (localX < Math.floor(paneWidth / 2) ? "LEFT" : "RIGHT") : null
		onSelectCommentLine(Math.max(0, Math.floor(this.scrollTop + localY)), side)
		event.preventDefault()
		event.stopPropagation()
	}
	const handleStickyMouseScroll = (event: MouseEvent) => {
		if (!event.scroll) return
		const scroll = scrollRef.current
		if (!scroll) return
		const delta = Math.max(1, Math.ceil(event.scroll.delta))
		const direction = event.scroll.direction === "down" || event.scroll.direction === "right" ? 1 : -1
		scroll.scrollBy({ x: 0, y: direction * delta })
		event.preventDefault()
		event.stopPropagation()
	}

	return (
		<box height={height} flexDirection="column">
			<DiffPaneHeader target={target} paneWidth={paneWidth} fileCount={readyFiles.length} />
			<Divider width={paneWidth} />
			<scrollbox ref={scrollRef} focusable={false} flexGrow={1} scrollY scrollX={false} onMouseDown={handleDiffMouseDown} onMouseScroll={handleStickyMouseScroll}>
				{stackedFiles.map((stackedFile) => (
					<box key={`${target.repoName}-${stackedFile.index}-${view}-${wrapMode}`} flexDirection="column" flexShrink={0}>
						{stackedFile.index > 0 ? <Divider width={paneWidth} /> : null}
						<PaddedRow>
							<FileHeader file={stackedFile.file} index={stackedFile.index} count={readyFiles.length} width={paneWidth} />
						</PaddedRow>
						<Divider width={paneWidth} />
						<diff
							ref={(diff: DiffRenderable | null) => setDiffRef(stackedFile.index, diff)}
							diff={stackedFile.file.patch}
							view={view}
							syncScroll
							filetype={stackedFile.file.filetype ?? "text"}
							syntaxStyle={syntaxStyle}
							fg={colors.text}
							showLineNumbers
							wrapMode={wrapMode}
							addedBg={colors.diff.addedBg}
							removedBg={colors.diff.removedBg}
							contextBg={colors.diff.contextBg}
							addedSignColor={colors.status.passing}
							removedSignColor={colors.status.failing}
							lineNumberFg={diffLineNumberFg}
							lineNumberBg={colors.diff.lineNumberBg}
							addedLineNumberBg={colors.diff.addedLineNumberBg}
							removedLineNumberBg={colors.diff.removedLineNumberBg}
							selectionBg={colors.selectedBg}
							selectionFg={colors.selectedText}
							height={stackedFile.diffHeight}
							style={{ flexShrink: 0 }}
						/>
					</box>
				))}
			</scrollbox>
			{stickyFile ? (
				<box
					position="absolute"
					top={2}
					left={0}
					width={paneWidth}
					height={2}
					zIndex={10}
					flexDirection="column"
					backgroundColor={colors.background}
					onMouseScroll={handleStickyMouseScroll}
				>
					{incomingFile ? (
						<>
							<Divider width={paneWidth} />
							<PaddedRow backgroundColor={colors.background}>
								<FileHeader
									file={incomingFile.file}
									index={incomingFile.index}
									count={readyFiles.length}
									width={paneWidth}
									suffix={stickySuffixFor(incomingFile)}
									suffixColor={stickySuffixColorFor(incomingFile)}
								/>
							</PaddedRow>
						</>
					) : (
						<>
							<PaddedRow backgroundColor={colors.background}>
								<FileHeader
									file={stickyFile.file}
									index={stickyFile.index}
									count={readyFiles.length}
									width={paneWidth}
									suffix={stickySuffixFor(stickyFile)}
									suffixColor={stickySuffixColorFor(stickyFile)}
								/>
							</PaddedRow>
							<Divider width={paneWidth} />
						</>
					)}
				</box>
			) : null}
			{commentPeek ? (
				<>
					<Divider width={paneWidth} />
					<PaddedRow>
						<CommentSegmentsLine segments={commentPeekMeta} />
					</PaddedRow>
					<PaddedRow>
						<CommentBodyLine body={commentPeek.body} width={Math.max(1, paneWidth - 2)} />
					</PaddedRow>
				</>
			) : null}
		</box>
	)
}
