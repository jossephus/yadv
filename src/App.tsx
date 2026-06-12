import type { DiffRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useKeymap } from "@ghui/keymap/react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AppCommand } from "./commands.js"
import { clampCommandIndex, defineCommand, filterCommands, sortCommandsByActiveScope } from "./commands.js"
import type { LocalDiffTarget } from "./diffTarget.js"
import { errorMessage } from "./errors.js"
import { appKeymap } from "./keymap/all.js"
import { buildChangedFilesModalCtx } from "./keymap/contexts/changedFilesModalCtx.js"
import { buildCommandPaletteCtx } from "./keymap/contexts/commandPaletteCtx.js"
import { buildThemeModalCtx } from "./keymap/contexts/themeModalCtx.js"
import { useOpenTuiSubscribe } from "./keyboard/opentuiAdapter.js"
import { appendLocalDiffCommentAtom, currentBranchAtom, diffFileIndexAtom, diffScrollTopAtom, localDiffCommentsAtom, repoNameAtom, workingTreeDiffAtom } from "./ui/diff/atoms.js"
import {
	buildStackedDiffFiles,
	diffAnchorOnSide,
	diffCommentAnchorLabel,
	diffFileStats,
	getStackedDiffCommentAnchors,
	minimizeWhitespaceDiffFiles,
	PullRequestDiffState,
	safeDiffFileIndex,
	scrollTopForVisibleLine,
	splitPatchFiles,
	stackedDiffFileIndexAtLine,
	verticalDiffAnchor,
	type DiffFilePatch,
} from "./ui/diff.js"
import { diffCommentRangeContains, diffCommentRangeLabel, diffCommentRangeSelection, diffCommentThreadMapKey, groupDiffCommentThreads, sameDiffCommentTarget } from "./ui/diff/comments.js"
import { useDiffLineColors } from "./ui/diff/useDiffLineColors.js"
import { editSingleLineInput, isSingleLineInputKey } from "./ui/singleLineInput.js"
import { CommandPalette } from "./ui/CommandPalette.js"
import { colors } from "./ui/colors.js"
import { DiffPane } from "./ui/DiffPane.js"
import { ChangedFilesModal, CommentModal, CommentThreadModal, initialChangedFilesModalState, initialCommandPaletteState, initialCommentModalState, initialCommentThreadModalState, initialThemeModalState, type ChangedFilesModalState, type CommandPaletteState, type CommentModalState, type CommentThreadModalState } from "./ui/modals.js"
import { filterChangedFiles } from "./ui/modals/shared.js"
import { ThemeModal } from "./ui/modals/ThemeModal.js"
import { centerCell, PlainLine } from "./ui/primitives.js"
import { SPINNER_FRAMES } from "./ui/spinner.js"
import { themeIdAtom } from "./ui/theme/atoms.js"
import { useThemeModal } from "./ui/theme/useThemeModal.js"
import { useSpinnerFrame } from "./ui/useSpinnerFrame.js"

interface AppProps {
	readonly systemThemeGeneration?: number
}

type ActiveModal = "none" | "changedFiles" | "commandPalette" | "theme" | "comment" | "commentThread"

const DIFF_STICKY_HEADER_LINES = 2
const wrapIndex = (index: number, length: number) => (length === 0 ? 0 : ((index % length) + length) % length)
const centeredOffset = (outer: number, inner: number) => Math.floor((outer - inner) / 2)
const diffStateFromPatch = (patch: string) => PullRequestDiffState.Ready({ patch, files: splitPatchFiles(patch) })

const sumDiffStats = (files: readonly DiffFilePatch[]) =>
	files.reduce(
		(totals, file) => {
			const stats = diffFileStats(file)
			return { additions: totals.additions + stats.additions, deletions: totals.deletions + stats.deletions }
		},
		{ additions: 0, deletions: 0 },
	)

export const App = ({ systemThemeGeneration = 0 }: AppProps) => {
	const renderer = useRenderer()
	const { width, height } = useTerminalDimensions()
	const diffResult = useAtomValue(workingTreeDiffAtom)
	const repoNameResult = useAtomValue(repoNameAtom)
	const branchResult = useAtomValue(currentBranchAtom)
	const localCommentsResult = useAtomValue(localDiffCommentsAtom)
	const themeId = useAtomValue(themeIdAtom)
	const [diffFileIndex, setDiffFileIndex] = useAtom(diffFileIndexAtom)
	const [diffScrollTop, setDiffScrollTop] = useAtom(diffScrollTopAtom)
	const refreshDiff = useAtomRefresh(workingTreeDiffAtom)
	const refreshRepoName = useAtomRefresh(repoNameAtom)
	const refreshBranch = useAtomRefresh(currentBranchAtom)
	const refreshLocalComments = useAtomRefresh(localDiffCommentsAtom)
	const appendLocalDiffComment = useAtomSet(appendLocalDiffCommentAtom, { mode: "promise" })
	const spinnerFrame = useSpinnerFrame({ active: diffResult.waiting, reset: !diffResult.waiting })
	const loadingIndicator = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? "·"
	const [activeModal, setActiveModal] = useState<ActiveModal>("none")
	const [changedFilesModal, setChangedFilesModal] = useState<ChangedFilesModalState>(initialChangedFilesModalState)
	const [commandPalette, setCommandPalette] = useState<CommandPaletteState>(initialCommandPaletteState)
	const [commentModal, setCommentModal] = useState<CommentModalState>(initialCommentModalState)
	const [commentThreadModal, setCommentThreadModal] = useState<CommentThreadModalState>(initialCommentThreadModalState)
	const [themeModal, setThemeModal] = useState(initialThemeModalState)
	const [diffRenderView, setDiffRenderView] = useState<"split" | "unified">(width >= 100 ? "split" : "unified")
	const [diffWrapMode, setDiffWrapMode] = useState<"none" | "word">("none")
	const [diffWhitespaceMode, setDiffWhitespaceMode] = useState<"ignore" | "show">("show")
	const [diffCommentAnchorIndex, setDiffCommentAnchorIndex] = useState(0)
	const [diffPreferredSide, setDiffPreferredSide] = useState<"LEFT" | "RIGHT" | null>(null)
	const [diffCommentRangeStartIndex, setDiffCommentRangeStartIndex] = useState<number | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const suppressNextDiffCommentScrollRef = useRef(false)

	const flashNotice = useCallback((message: string) => {
		setNotice(message)
		globalThis.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2000)
	}, [])

	const closeActiveModal = useCallback(() => setActiveModal("none"), [])
	const { openThemeModal, closeThemeModal, moveThemeSelection, updateThemeQuery, toggleThemeMode, toggleThemeTone, editThemeQuery } = useThemeModal({
		themeModal,
		setThemeModal,
		closeActiveModal,
		flashNotice,
	})

	const repoName = AsyncResult.isSuccess(repoNameResult) ? repoNameResult.value : null
	const branch = AsyncResult.isSuccess(branchResult) ? branchResult.value : null
	const readyDiffState = AsyncResult.isSuccess(diffResult) ? diffStateFromPatch(diffResult.value.patch) : undefined
	const diffState = AsyncResult.isFailure(diffResult)
		? PullRequestDiffState.Error({ error: errorMessage(diffResult.cause) })
		: diffResult.waiting && !readyDiffState
			? PullRequestDiffState.Loading()
			: readyDiffState
	const allFiles = diffState?._tag === "Ready" ? diffState.files : []
	const localComments = AsyncResult.isSuccess(localCommentsResult) ? localCommentsResult.value : []
	const displayFiles = useMemo(() => (diffWhitespaceMode === "ignore" ? minimizeWhitespaceDiffFiles(allFiles) : allFiles), [allFiles, diffWhitespaceMode])
	const stackedDiffFiles = useMemo(
		() => buildStackedDiffFiles(displayFiles, diffRenderView, diffWrapMode, Math.max(20, width)),
		[displayFiles, diffRenderView, diffWrapMode, width],
	)
	const diffTarget = useMemo<LocalDiffTarget | null>(() => {
		if (!repoName || !branch) return null
		const stats = sumDiffStats(displayFiles)
		return { repoName, branch, additions: stats.additions, deletions: stats.deletions }
	}, [branch, displayFiles, repoName])
	const diffCommentThreads = useMemo(() => groupDiffCommentThreads(localComments), [localComments])
	const diffCommentAnchors = useMemo(() => getStackedDiffCommentAnchors(stackedDiffFiles, diffRenderView, diffWrapMode, Math.max(20, width)), [stackedDiffFiles, diffRenderView, diffWrapMode, width])
	const selectedDiffCommentAnchor = diffCommentAnchors[diffCommentAnchorIndex] ?? null
	const diffCommentRangeStartAnchor = diffCommentRangeStartIndex === null ? null : diffCommentAnchors[diffCommentRangeStartIndex] ?? null
	const selectedDiffCommentRange = diffCommentRangeSelection(diffCommentRangeStartAnchor, selectedDiffCommentAnchor)
	const selectedDiffCommentRangeAnchors = useMemo(() => (selectedDiffCommentRange ? diffCommentAnchors.filter((anchor) => diffCommentRangeContains(selectedDiffCommentRange, anchor)) : []), [diffCommentAnchors, selectedDiffCommentRange])
	const diffCommentThreadAnchors = useMemo(
		() =>
			diffCommentAnchors.filter((anchor) => {
				const key = diffCommentThreadMapKey(anchor)
				return (diffCommentThreads[key]?.length ?? 0) > 0
			}),
		[diffCommentAnchors, diffCommentThreads],
	)
	const selectedDiffCommentThread = selectedDiffCommentAnchor ? diffCommentThreads[diffCommentThreadMapKey(selectedDiffCommentAnchor)] ?? [] : []
	const selectedDiffCommentLabel = selectedDiffCommentRange ? diffCommentRangeLabel(selectedDiffCommentRange) : selectedDiffCommentAnchor ? diffCommentAnchorLabel(selectedDiffCommentAnchor) : null

	useEffect(() => {
		renderer.setBackgroundColor(colors.background)
	}, [renderer, themeId, systemThemeGeneration])

	useEffect(() => {
		setDiffRenderView(width >= 100 ? "split" : "unified")
	}, [width])

	useEffect(() => {
		if (displayFiles.length === 0) {
			setDiffFileIndex(0)
			setDiffScrollTop(0)
			setDiffCommentAnchorIndex(0)
			return
		}
		setDiffFileIndex((current) => safeDiffFileIndex(displayFiles, current))
	}, [displayFiles, setDiffFileIndex, setDiffScrollTop])

	useEffect(() => {
		setDiffCommentAnchorIndex((current) => Math.max(0, Math.min(diffCommentAnchors.length - 1, current)))
		if (diffCommentRangeStartIndex !== null && diffCommentRangeStartIndex >= diffCommentAnchors.length) setDiffCommentRangeStartIndex(null)
	}, [diffCommentAnchors.length, diffCommentRangeStartIndex])

	const syncDiffScrollState = useCallback(() => {
		const scrollTop = diffScrollRef.current?.scrollTop
		if (scrollTop === undefined || stackedDiffFiles.length === 0) return
		setDiffScrollTop(scrollTop)
		setDiffFileIndex(Math.max(0, stackedDiffFileIndexAtLine(stackedDiffFiles, scrollTop)))
	}, [setDiffFileIndex, setDiffScrollTop, stackedDiffFiles])

	useEffect(() => {
		const interval = globalThis.setInterval(syncDiffScrollState, 80)
		return () => globalThis.clearInterval(interval)
	}, [syncDiffScrollState])

	const scrollToY = useCallback(
		(y: number) => {
			diffScrollRef.current?.scrollTo({ x: 0, y: Math.max(0, y) })
			syncDiffScrollState()
		},
		[syncDiffScrollState],
	)

	const selectDiffFile = useCallback(
		(index: number) => {
			if (displayFiles.length === 0) return
			const nextIndex = safeDiffFileIndex(displayFiles, index)
			setDiffFileIndex(nextIndex)
			const stackedFile = stackedDiffFiles[nextIndex]
			if (stackedFile) scrollToY(stackedFile.headerLine)
		},
		[displayFiles, scrollToY, setDiffFileIndex, stackedDiffFiles],
	)

	const ensureDiffLineVisible = useCallback(
		(line: number) => {
			const scroll = diffScrollRef.current
			if (!scroll) return
			const nextTop = scrollTopForVisibleLine(scroll.scrollTop, Math.max(1, height - 4), line, DIFF_STICKY_HEADER_LINES)
			if (nextTop !== scroll.scrollTop) {
				scroll.scrollTo({ x: 0, y: nextTop })
				syncDiffScrollState()
			}
		},
		[height, syncDiffScrollState],
	)

	const navigableDiffCommentAnchors = useCallback(() => (diffCommentRangeStartAnchor ? diffCommentAnchors.filter((anchor) => sameDiffCommentTarget(anchor, diffCommentRangeStartAnchor)) : diffCommentAnchors), [diffCommentAnchors, diffCommentRangeStartAnchor])

	const moveDiffCommentAnchor = useCallback(
		(delta: number, options: { preserveViewportRow?: boolean } = {}) => {
			const anchors = navigableDiffCommentAnchors()
			if (anchors.length === 0) return
			const currentAnchor = selectedDiffCommentAnchor && anchors.includes(selectedDiffCommentAnchor) ? selectedDiffCommentAnchor : anchors[0]
			const nextAnchor = verticalDiffAnchor(anchors, currentAnchor ?? null, delta, diffPreferredSide)
			if (!nextAnchor) return
			if (options.preserveViewportRow) {
				const scroll = diffScrollRef.current
				if (scroll && currentAnchor) {
					const maxScreenOffset = Math.max(DIFF_STICKY_HEADER_LINES, scroll.viewport.height - 2)
					const screenOffset = Math.max(DIFF_STICKY_HEADER_LINES, Math.min(maxScreenOffset, currentAnchor.renderLine - scroll.scrollTop))
					const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.viewport.height)
					const nextTop = Math.max(0, Math.min(maxScrollTop, nextAnchor.renderLine - screenOffset))
					suppressNextDiffCommentScrollRef.current = true
					scroll.scrollTo({ x: 0, y: nextTop })
					syncDiffScrollState()
				}
			}
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
		},
		[diffCommentAnchors, diffPreferredSide, navigableDiffCommentAnchors, selectedDiffCommentAnchor, setDiffFileIndex, syncDiffScrollState],
	)

	const moveDiffCommentToBoundary = useCallback(
		(boundary: "first" | "last") => {
			const anchors = navigableDiffCommentAnchors()
			const nextAnchor = boundary === "first" ? anchors[0] : anchors[anchors.length - 1]
			if (!nextAnchor) return
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
			ensureDiffLineVisible(nextAnchor.renderLine)
		},
		[diffCommentAnchors, ensureDiffLineVisible, navigableDiffCommentAnchors, setDiffFileIndex],
	)

	const alignSelectedDiffCommentAnchor = useCallback(
		(position: "top" | "center" | "bottom") => {
			const scroll = diffScrollRef.current
			if (!scroll || !selectedDiffCommentAnchor) return
			const viewportHeight = Math.max(1, scroll.viewport.height)
			const offset =
				position === "top"
					? DIFF_STICKY_HEADER_LINES
					: position === "center"
						? Math.max(DIFF_STICKY_HEADER_LINES, Math.floor(viewportHeight / 2))
						: Math.max(DIFF_STICKY_HEADER_LINES, viewportHeight - 2)
			scrollToY(selectedDiffCommentAnchor.renderLine - offset)
		},
		[selectedDiffCommentAnchor, scrollToY],
	)

	const selectDiffCommentSide = useCallback(
		(side: "LEFT" | "RIGHT") => {
			setDiffPreferredSide(side)
			if (!selectedDiffCommentAnchor) return
			const nextAnchor = diffAnchorOnSide(diffCommentAnchors, selectedDiffCommentAnchor, side)
			if (!nextAnchor) return
			setDiffCommentRangeStartIndex(null)
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		},
		[diffCommentAnchors, selectedDiffCommentAnchor],
	)

	const selectDiffCommentLine = useCallback(
		(renderLine: number, side: "LEFT" | "RIGHT" | null) => {
			const fileIndex = stackedDiffFileIndexAtLine(stackedDiffFiles, renderLine)
			const stackedFile = stackedDiffFiles[fileIndex]
			if (!stackedFile || renderLine < stackedFile.diffStartLine || renderLine >= stackedFile.diffStartLine + stackedFile.diffHeight) return
			const fileAnchors = diffCommentAnchors.filter((anchor) => anchor.fileIndex === fileIndex)
			const lineAnchors = fileAnchors.filter((anchor) => anchor.renderLine === renderLine)
			const nextAnchor = (side ? lineAnchors.find((anchor) => anchor.side === side) : undefined) ?? lineAnchors[0] ?? [...fileAnchors].reverse().find((anchor) => anchor.renderLine <= renderLine)
			if (!nextAnchor) return
			suppressNextDiffCommentScrollRef.current = true
			setDiffPreferredSide(side ?? nextAnchor.side)
			if (diffCommentRangeStartAnchor && !sameDiffCommentTarget(diffCommentRangeStartAnchor, nextAnchor)) setDiffCommentRangeStartIndex(null)
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
		},
		[diffCommentAnchors, diffCommentRangeStartAnchor, stackedDiffFiles, setDiffFileIndex],
	)

	const moveDiffCommentThread = useCallback(
		(delta: 1 | -1) => {
			if (diffCommentThreadAnchors.length === 0) return
			const currentIndex = selectedDiffCommentAnchor ? Math.max(0, diffCommentThreadAnchors.findIndex((anchor) => anchor.renderLine >= selectedDiffCommentAnchor.renderLine)) : 0
			const nextAnchor = diffCommentThreadAnchors[wrapIndex(currentIndex + delta, diffCommentThreadAnchors.length)]
			if (!nextAnchor) return
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
		},
		[diffCommentAnchors, diffCommentThreadAnchors, selectedDiffCommentAnchor, setDiffFileIndex],
	)

	const openDiffCommentModal = useCallback(() => {
		setCommentModal({ ...initialCommentModalState, target: { kind: "diff" } })
		setActiveModal("comment")
	}, [])

	const openReplyToSelectedComment = useCallback(() => {
		const comment = selectedDiffCommentThread[selectedDiffCommentThread.length - 1]
		const anchorLabel = selectedDiffCommentLabel ?? "Selected thread"
		if (!comment) return
		setCommentThreadModal(initialCommentThreadModalState)
		setCommentModal({ ...initialCommentModalState, target: { kind: "reply", inReplyTo: comment.id, anchorLabel } })
		setActiveModal("comment")
	}, [selectedDiffCommentLabel, selectedDiffCommentThread])

	const openSelectedDiffComment = useCallback(() => {
		if (!selectedDiffCommentAnchor) return
		if (selectedDiffCommentThread.length > 0) {
			setCommentThreadModal(initialCommentThreadModalState)
			setActiveModal("commentThread")
			return
		}
		openDiffCommentModal()
	}, [openDiffCommentModal, selectedDiffCommentAnchor, selectedDiffCommentThread.length])

	const toggleDiffCommentRange = useCallback(() => {
		if (!selectedDiffCommentAnchor) return
		setDiffCommentRangeStartIndex((current) => (current === null ? diffCommentAnchors.indexOf(selectedDiffCommentAnchor) : null))
	}, [diffCommentAnchors, selectedDiffCommentAnchor])

	const setCommentEditorValue = useCallback((body: string, cursor: number) => {
		setCommentModal((current) => ({ ...current, body, cursor, error: null }))
	}, [])

	const submitCommentModal = useCallback(() => {
		if (!selectedDiffCommentAnchor) return
		const body = commentModal.body.trim()
		if (body.length === 0) {
			setCommentModal((current) => ({ ...current, error: "Write a comment before saving." }))
			return
		}
		const selectedRange = diffCommentRangeSelection(diffCommentRangeStartAnchor, selectedDiffCommentAnchor)
		const target = selectedRange?.end ?? selectedDiffCommentAnchor
		const inReplyTo = commentModal.target.kind === "reply" ? commentModal.target.inReplyTo : null
		const startLine = inReplyTo ? undefined : selectedRange && selectedRange.start.line !== selectedRange.end.line ? selectedRange.start.line : undefined
		const startSide = inReplyTo ? undefined : selectedRange && selectedRange.start.line !== selectedRange.end.line ? selectedRange.start.side : undefined
		closeActiveModal()
		flashNotice(`Commenting on ${target.path}:${target.line}`)
		void appendLocalDiffComment({ path: target.path, line: target.line, side: target.side, body, author: "you", inReplyTo, ...(startLine === undefined ? {} : { startLine }), ...(startSide === undefined ? {} : { startSide }) })
			.then(() => {
				setCommentModal(initialCommentModalState)
				setDiffCommentRangeStartIndex(null)
				refreshLocalComments()
				flashNotice(`Commented on ${target.path}:${target.line}`)
			})
			.catch((error) => {
				flashNotice(errorMessage(error))
			})
	}, [appendLocalDiffComment, closeActiveModal, commentModal.body, commentModal.target.kind, diffCommentRangeStartAnchor, flashNotice, refreshLocalComments, selectedDiffCommentAnchor])

	const { setDiffRenderableRef } = useDiffLineColors({
		diffLineColorContextKey: `${diffRenderView}:${diffWrapMode}:${diffWhitespaceMode}:${displayFiles.length}`,
		effectiveDiffRenderView: diffRenderView,
		selectedDiffCommentAnchor,
		selectedDiffCommentRangeAnchors,
		diffCommentThreadAnchors,
		suppressNextDiffCommentScrollRef,
		ensureDiffLineVisible,
	})

	const changedFileResults = useMemo(() => filterChangedFiles(displayFiles, changedFilesModal.query), [changedFilesModal.query, displayFiles])
	const modalWidth = Math.min(width - 4, 72)
	const modalHeight = Math.min(height - 4, 20)
	const modalOffsetLeft = Math.max(0, centeredOffset(width, modalWidth))
	const modalOffsetTop = Math.max(0, centeredOffset(height, modalHeight))
	const commands = useMemo<readonly AppCommand[]>(
		() => [
			defineCommand({ id: "diff.comment", title: "Comment on Selected Line", scope: "Diff", shortcut: "enter", run: openSelectedDiffComment }),
			defineCommand({ id: "diff.range", title: "Toggle Comment Range", scope: "Diff", shortcut: "v", run: toggleDiffCommentRange }),
			defineCommand({
				id: "diff.toggle-view",
				title: `Diff View: ${diffRenderView === "split" ? "Unified" : "Split"}`,
				scope: "Diff",
				shortcut: "V",
				run: () => setDiffRenderView((current) => (current === "split" ? "unified" : "split")),
			}),
			defineCommand({
				id: "diff.toggle-wrap",
				title: `Wrap: ${diffWrapMode === "none" ? "On" : "Off"}`,
				scope: "Diff",
				shortcut: "w",
				run: () => setDiffWrapMode((current) => (current === "none" ? "word" : "none")),
			}),
			defineCommand({
				id: "diff.toggle-whitespace",
				title: `Whitespace: ${diffWhitespaceMode === "show" ? "Ignore" : "Show"}`,
				scope: "Diff",
				shortcut: "W",
				run: () => setDiffWhitespaceMode((current) => (current === "show" ? "ignore" : "show")),
			}),
			defineCommand({
				id: "diff.changed-files",
				title: "Changed Files",
				scope: "Navigation",
				shortcut: "f",
				run: () => {
					setChangedFilesModal({ ...initialChangedFilesModalState, selectedIndex: safeDiffFileIndex(displayFiles, diffFileIndex) })
					setActiveModal("changedFiles")
				},
			}),
			defineCommand({
				id: "view.themes",
				title: "Themes",
				scope: "View",
				run: () => {
					openThemeModal()
					setActiveModal("theme")
				},
			}),
			defineCommand({
				id: "diff.reload",
				title: "Reload Diff",
				scope: "Global",
				shortcut: "r",
				run: () => {
					refreshDiff()
					refreshRepoName()
					refreshBranch()
				},
			}),
			defineCommand({ id: "app.quit", title: "Quit", scope: "System", shortcut: "q", run: () => renderer.destroy() }),
		],
		[diffFileIndex, diffRenderView, diffWhitespaceMode, diffWrapMode, displayFiles, openSelectedDiffComment, openThemeModal, refreshBranch, refreshDiff, refreshRepoName, renderer, toggleDiffCommentRange],
	)
	const filteredCommands = useMemo(() => sortCommandsByActiveScope(filterCommands(commands, commandPalette.query), "Diff"), [commandPalette.query, commands])
	const selectedCommand = filteredCommands[clampCommandIndex(commandPalette.selectedIndex, filteredCommands)] ?? null

	const runCommand = useCallback(
		(command: AppCommand) => {
			closeActiveModal()
			command.run()
		},
		[closeActiveModal],
	)

	useKeyboard((key) => {
		if (activeModal === "commandPalette") {
			if (isSingleLineInputKey(key)) setCommandPalette((current) => ({ ...current, query: editSingleLineInput(current.query, key) ?? current.query, selectedIndex: 0 }))
			return
		}
		if (activeModal === "comment") return
		if (activeModal === "changedFiles") {
			if (isSingleLineInputKey(key)) setChangedFilesModal((current) => ({ ...current, query: editSingleLineInput(current.query, key) ?? current.query, selectedIndex: 0 }))
			return
		}
		if (activeModal === "theme" && themeModal.filterMode) {
			if (isSingleLineInputKey(key)) editThemeQuery((query) => editSingleLineInput(query, key) ?? query)
			return
		}
	})

	useKeymap(
		appKeymap,
		{
			changedFilesModalActive: activeModal === "changedFiles",
			commentModalActive: activeModal === "comment",
			commentThreadModalActive: activeModal === "commentThread",
			themeModalActive: activeModal === "theme",
			commandPaletteActive: activeModal === "commandPalette",
			textInputActive: activeModal === "comment" || activeModal === "commandPalette" || activeModal === "changedFiles" || (activeModal === "theme" && themeModal.filterMode),
			changedFilesModal: buildChangedFilesModalCtx({
				hasResults: changedFileResults.length > 0,
				closeActiveModal,
				selectChangedFile: () => {
					const selectedIndex = Math.max(0, Math.min(changedFilesModal.selectedIndex, changedFileResults.length - 1))
					const entry = changedFileResults[selectedIndex]
					if (!entry) return
					closeActiveModal()
					selectDiffFile(entry.index)
				},
				moveChangedFileSelection: (delta) =>
					setChangedFilesModal((current) => ({ ...current, selectedIndex: wrapIndex(current.selectedIndex + delta, Math.max(1, changedFileResults.length)) })),
			}),
			themeModal: buildThemeModalCtx({ themeModal, closeThemeModal, updateThemeQuery, toggleThemeMode, toggleThemeTone, moveThemeSelection }),
			commandPalette: buildCommandPaletteCtx({
				closeActiveModal,
				selectedCommand,
				runCommandPaletteCommand: runCommand,
				moveCommandPaletteSelection: (delta) =>
					setCommandPalette((current) => ({ ...current, selectedIndex: wrapIndex(current.selectedIndex + delta, Math.max(1, filteredCommands.length)) })),
			}),
			commentModal: { closeModal: closeActiveModal },
			commentThreadModal: {
				halfPage: Math.max(1, Math.floor(height / 2)),
				closeModal: closeActiveModal,
				openInlineComment: openReplyToSelectedComment,
				scrollBy: (delta) => setCommentThreadModal((current) => ({ ...current, scrollOffset: Math.max(0, current.scrollOffset + delta) })),
			},
			diff: {
				halfPage: Math.max(1, Math.floor(height / 2)),
				handleEscape: () => {
					if (diffCommentRangeStartIndex !== null) setDiffCommentRangeStartIndex(null)
					else closeActiveModal()
				},
				openSelectedComment: openSelectedDiffComment,
				toggleRange: toggleDiffCommentRange,
				toggleView: () => setDiffRenderView((current) => (current === "split" ? "unified" : "split")),
				toggleWrap: () => setDiffWrapMode((current) => (current === "none" ? "word" : "none")),
				toggleWhitespace: () => setDiffWhitespaceMode((current) => (current === "show" ? "ignore" : "show")),
				nextThread: () => moveDiffCommentThread(1),
				previousThread: () => moveDiffCommentThread(-1),
				reload: () => {
					refreshDiff()
					refreshRepoName()
					refreshBranch()
					refreshLocalComments()
				},
				moveAnchor: moveDiffCommentAnchor,
				moveAnchorToBoundary: moveDiffCommentToBoundary,
				alignAnchor: alignSelectedDiffCommentAnchor,
				selectSide: selectDiffCommentSide,
				openChangedFiles: () => {
					setChangedFilesModal({ ...initialChangedFilesModalState, selectedIndex: safeDiffFileIndex(displayFiles, diffFileIndex) })
					setActiveModal("changedFiles")
				},
				nextFile: () => selectDiffFile(diffFileIndex + 1),
				previousFile: () => selectDiffFile(diffFileIndex - 1),
			},
			openCommandPalette: () => {
				setCommandPalette(initialCommandPaletteState)
				setActiveModal("commandPalette")
			},
			handleQuitOrClose: () => (activeModal === "none" ? renderer.destroy() : closeActiveModal()),
		},
		useOpenTuiSubscribe(),
	)

	const setDiffRef = useCallback((index: number, diff: DiffRenderable | null) => setDiffRenderableRef(index, diff), [setDiffRenderableRef])

	return (
		<box width={width} height={height} flexDirection="column" backgroundColor={colors.background}>
			<box flexGrow={1}>
				<DiffPane
					target={diffTarget}
					diffState={diffState}
					stackedFiles={stackedDiffFiles}
					scrollTop={diffScrollTop}
					view={diffRenderView}
					whitespaceMode={diffWhitespaceMode}
					wrapMode={diffWrapMode}
					paneWidth={width}
					height={height - 1}
					loadingIndicator={loadingIndicator}
					scrollRef={diffScrollRef}
					setDiffRef={setDiffRef}
					selectedCommentAnchor={selectedDiffCommentAnchor}
					selectedCommentLabel={selectedDiffCommentLabel}
					selectedCommentThread={selectedDiffCommentThread}
					onSelectCommentLine={selectDiffCommentLine}
					themeId={themeId}
					themeGeneration={systemThemeGeneration}
				/>
				{activeModal === "changedFiles" ? (
					<ChangedFilesModal
						state={changedFilesModal}
						results={changedFileResults}
						totalCount={displayFiles.length}
						modalWidth={modalWidth}
						modalHeight={modalHeight}
						offsetLeft={modalOffsetLeft}
						offsetTop={modalOffsetTop}
					/>
				) : null}
				{activeModal === "commandPalette" ? (
					<CommandPalette
						commands={filteredCommands}
						query={commandPalette.query}
						selectedIndex={commandPalette.selectedIndex}
						modalWidth={modalWidth}
						modalHeight={modalHeight}
						offsetLeft={modalOffsetLeft}
						offsetTop={modalOffsetTop}
						onSelectCommandIndex={(index) => setCommandPalette((current) => ({ ...current, selectedIndex: index }))}
						onRunCommand={runCommand}
					/>
				) : null}
				{activeModal === "theme" ? (
					<ThemeModal state={themeModal} modalWidth={modalWidth} modalHeight={modalHeight} offsetLeft={modalOffsetLeft} offsetTop={modalOffsetTop} />
				) : null}
				{activeModal === "comment" ? <CommentModal state={commentModal} anchorLabel={selectedDiffCommentAnchor ? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel ?? ""}`.trim() : "No diff line selected"} modalWidth={modalWidth} modalHeight={modalHeight} offsetLeft={modalOffsetLeft} offsetTop={modalOffsetTop} onChange={setCommentEditorValue} onSubmit={submitCommentModal} /> : null}
				{activeModal === "commentThread" ? <CommentThreadModal state={commentThreadModal} anchorLabel={selectedDiffCommentAnchor ? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel ?? ""}`.trim() : "Selected thread"} comments={selectedDiffCommentThread} modalWidth={modalWidth} modalHeight={Math.min(height - 4, 22)} offsetLeft={modalOffsetLeft} offsetTop={Math.max(0, centeredOffset(height, Math.min(height - 4, 22)))} /> : null}
			</box>
			<PlainLine text={centerCell(notice ?? "enter comment   v range   f files   V view   w wrap   W whitespace   r reload   ctrl-p commands   q quit", width)} fg={notice ? colors.text : colors.muted} />
		</box>
	)
}
