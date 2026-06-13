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
import { resolveHunkStageAction, resolveHunkStatus, type HunkStatus } from "./gitHunks.js"
import { formatCommentsForClipboard } from "./localComments.js"
import { appKeymap } from "./keymap/all.js"
import { diffHunkKeys } from "./keymap/diffView.js"
import { buildChangedFilesModalCtx } from "./keymap/contexts/changedFilesModalCtx.js"
import { buildCommandPaletteCtx } from "./keymap/contexts/commandPaletteCtx.js"
import { buildThemeModalCtx } from "./keymap/contexts/themeModalCtx.js"
import { useOpenTuiSubscribe } from "./keyboard/opentuiAdapter.js"
import {
	appendLocalDiffCommentAtom,
	copyTextAtom,
	currentBranchAtom,
	deleteLocalDiffCommentAtom,
	diffFileIndexAtom,
	diffScrollTopAtom,
	localDiffCommentsAtom,
	readStagedDiffAtom,
	readUnstagedDiffAtom,
	repoNameAtom,
	stagedDiffAtom,
	stagePatchAtom,
	unstagePatchAtom,
	unstagedDiffAtom,
	workingTreeDiffAtom,
} from "./ui/diff/atoms.js"
import {
	buildStackedDiffFiles,
	diffAnchorOnSide,
	diffCommentAnchorLabel,
	diffFileStats,
	getStackedDiffHunks,
	getStackedDiffCommentAnchors,
	minimizeWhitespaceDiffFiles,
	PullRequestDiffState,
	safeDiffFileIndex,
	scrollTopForVisibleLine,
	splitPatchFiles,
	getDiffFileHunks,
	stackedDiffFileIndexAtLine,
	verticalDiffAnchor,
	type DiffFilePatch,
} from "./ui/diff.js"
import {
	diffCommentRangeContains,
	diffCommentRangeLabel,
	diffCommentRangeSelection,
	diffCommentThreadMapKey,
	groupDiffCommentThreads,
	sameDiffCommentTarget,
} from "./ui/diff/comments.js"
import { useDiffLineColors } from "./ui/diff/useDiffLineColors.js"
import { editSingleLineInput, isSingleLineInputKey } from "./ui/singleLineInput.js"
import { CommandPalette } from "./ui/CommandPalette.js"
import { colors } from "./ui/colors.js"
import { DiffPane } from "./ui/DiffPane.js"
import {
	ChangedFilesModal,
	CommentModal,
	CommentsOverviewModal,
	CommentThreadModal,
	initialChangedFilesModalState,
	initialCommandPaletteState,
	initialCommentModalState,
	initialCommentsOverviewModalState,
	initialCommentThreadModalState,
	initialThemeModalState,
	type ChangedFilesModalState,
	type CommandPaletteState,
	type CommentModalState,
	type CommentsOverviewModalState,
	type CommentThreadModalState,
} from "./ui/modals.js"
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

type ActiveModal = "none" | "changedFiles" | "commandPalette" | "theme" | "comment" | "commentThread" | "commentsOverview"

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
	const unstagedDiffResult = useAtomValue(unstagedDiffAtom)
	const stagedDiffResult = useAtomValue(stagedDiffAtom)
	const repoNameResult = useAtomValue(repoNameAtom)
	const branchResult = useAtomValue(currentBranchAtom)
	const localCommentsResult = useAtomValue(localDiffCommentsAtom)
	const themeId = useAtomValue(themeIdAtom)
	const [diffFileIndex, setDiffFileIndex] = useAtom(diffFileIndexAtom)
	const [diffScrollTop, setDiffScrollTop] = useAtom(diffScrollTopAtom)
	const refreshDiff = useAtomRefresh(workingTreeDiffAtom)
	const refreshUnstagedDiff = useAtomRefresh(unstagedDiffAtom)
	const refreshStagedDiff = useAtomRefresh(stagedDiffAtom)
	const refreshRepoName = useAtomRefresh(repoNameAtom)
	const refreshBranch = useAtomRefresh(currentBranchAtom)
	const refreshLocalComments = useAtomRefresh(localDiffCommentsAtom)
	const appendLocalDiffComment = useAtomSet(appendLocalDiffCommentAtom, { mode: "promise" })
	const deleteLocalDiffComment = useAtomSet(deleteLocalDiffCommentAtom, { mode: "promise" })
	const copyText = useAtomSet(copyTextAtom, { mode: "promise" })
	const readUnstagedDiff = useAtomSet(readUnstagedDiffAtom, { mode: "promise" })
	const readStagedDiff = useAtomSet(readStagedDiffAtom, { mode: "promise" })
	const stagePatch = useAtomSet(stagePatchAtom, { mode: "promise" })
	const unstagePatch = useAtomSet(unstagePatchAtom, { mode: "promise" })
	const spinnerFrame = useSpinnerFrame({ active: diffResult.waiting, reset: !diffResult.waiting })
	const loadingIndicator = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? "·"
	const [activeModal, setActiveModal] = useState<ActiveModal>("none")
	const [changedFilesModal, setChangedFilesModal] = useState<ChangedFilesModalState>(initialChangedFilesModalState)
	const [commandPalette, setCommandPalette] = useState<CommandPaletteState>(initialCommandPaletteState)
	const [commentModal, setCommentModal] = useState<CommentModalState>(initialCommentModalState)
	const [commentThreadModal, setCommentThreadModal] = useState<CommentThreadModalState>(initialCommentThreadModalState)
	const [commentsOverviewModal, setCommentsOverviewModal] = useState<CommentsOverviewModalState>(initialCommentsOverviewModalState)
	const [themeModal, setThemeModal] = useState(initialThemeModalState)
	const [diffRenderView, setDiffRenderView] = useState<"split" | "unified">(width >= 100 ? "split" : "unified")
	const [diffWrapMode, setDiffWrapMode] = useState<"none" | "word">("none")
	const [diffWhitespaceMode, setDiffWhitespaceMode] = useState<"ignore" | "show">("show")
	const [diffCommentAnchorIndex, setDiffCommentAnchorIndex] = useState(0)
	const [diffPreferredSide, setDiffPreferredSide] = useState<"LEFT" | "RIGHT" | null>(null)
	const [diffCommentRangeStartIndex, setDiffCommentRangeStartIndex] = useState<number | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const [vimModeEnabled, setVimModeEnabled] = useState(false)
	const [vimInsertMode, setVimInsertMode] = useState(false)
	const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const suppressNextDiffCommentScrollRef = useRef(false)

	const flashNotice = useCallback((message: string) => {
		setNotice(message)
		globalThis.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2000)
	}, [])

	const closeActiveModal = useCallback(() => {
		setVimInsertMode(false)
		setActiveModal("none")
	}, [])
	const enterVimInsertMode = useCallback(() => setVimInsertMode(true), [])
	const leaveVimInsertMode = useCallback(() => setVimInsertMode(false), [])
	const toggleVimMode = useCallback(() => {
		setVimModeEnabled((current) => {
			const next = !current
			setVimInsertMode(false)
			flashNotice(next ? "Vim mode enabled" : "Vim mode disabled")
			return next
		})
	}, [flashNotice])
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
	const diffCommentAnchors = useMemo(
		() => getStackedDiffCommentAnchors(stackedDiffFiles, diffRenderView, diffWrapMode, Math.max(20, width)),
		[stackedDiffFiles, diffRenderView, diffWrapMode, width],
	)
	const diffHunks = useMemo(() => getStackedDiffHunks(stackedDiffFiles, diffRenderView, diffWrapMode, Math.max(20, width)), [stackedDiffFiles, diffRenderView, diffWrapMode, width])
	const displayedFileHunks = useMemo(
		() => displayFiles.map((file) => getDiffFileHunks(file, diffRenderView, diffWrapMode, Math.max(20, width))),
		[diffRenderView, diffWrapMode, displayFiles, width],
	)
	const unstagedPatch = AsyncResult.isSuccess(unstagedDiffResult) ? unstagedDiffResult.value : ""
	const stagedPatch = AsyncResult.isSuccess(stagedDiffResult) ? stagedDiffResult.value : ""
	const selectedDiffCommentAnchor = diffCommentAnchors[diffCommentAnchorIndex] ?? null
	const diffCommentRangeStartAnchor = diffCommentRangeStartIndex === null ? null : (diffCommentAnchors[diffCommentRangeStartIndex] ?? null)
	const selectedDiffCommentRange = diffCommentRangeSelection(diffCommentRangeStartAnchor, selectedDiffCommentAnchor)
	const selectedDiffCommentRangeAnchors = useMemo(
		() => (selectedDiffCommentRange ? diffCommentAnchors.filter((anchor) => diffCommentRangeContains(selectedDiffCommentRange, anchor)) : []),
		[diffCommentAnchors, selectedDiffCommentRange],
	)
	const diffCommentThreadAnchors = useMemo(
		() =>
			diffCommentAnchors.filter((anchor) => {
				const key = diffCommentThreadMapKey(anchor)
				return (diffCommentThreads[key]?.length ?? 0) > 0
			}),
		[diffCommentAnchors, diffCommentThreads],
	)
	const selectedDiffCommentThread = selectedDiffCommentAnchor ? (diffCommentThreads[diffCommentThreadMapKey(selectedDiffCommentAnchor)] ?? []) : []
	const selectedDiffCommentLabel = selectedDiffCommentRange
		? diffCommentRangeLabel(selectedDiffCommentRange)
		: selectedDiffCommentAnchor
			? diffCommentAnchorLabel(selectedDiffCommentAnchor)
			: null

	useEffect(() => {
		renderer.setBackgroundColor(colors.background)
	}, [renderer, themeId, systemThemeGeneration])

	useEffect(() => {
		setDiffRenderView(width >= 100 ? "split" : "unified")
	}, [width])

	useEffect(() => {
		if (!vimModeEnabled && vimInsertMode) setVimInsertMode(false)
	}, [vimInsertMode, vimModeEnabled])

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

	const navigableDiffCommentAnchors = useCallback(
		() => (diffCommentRangeStartAnchor ? diffCommentAnchors.filter((anchor) => sameDiffCommentTarget(anchor, diffCommentRangeStartAnchor)) : diffCommentAnchors),
		[diffCommentAnchors, diffCommentRangeStartAnchor],
	)

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
			const nextAnchor =
				(side ? lineAnchors.find((anchor) => anchor.side === side) : undefined) ?? lineAnchors[0] ?? [...fileAnchors].reverse().find((anchor) => anchor.renderLine <= renderLine)
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
			const currentIndex = selectedDiffCommentAnchor
				? Math.max(
						0,
						diffCommentThreadAnchors.findIndex((anchor) => anchor.renderLine >= selectedDiffCommentAnchor.renderLine),
					)
				: 0
			const nextAnchor = diffCommentThreadAnchors[wrapIndex(currentIndex + delta, diffCommentThreadAnchors.length)]
			if (!nextAnchor) return
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
		},
		[diffCommentAnchors, diffCommentThreadAnchors, selectedDiffCommentAnchor, setDiffFileIndex],
	)

	const moveDiffHunk = useCallback(
		(direction: 1 | -1) => {
			if (diffHunks.length === 0) return
			const currentLine = selectedDiffCommentAnchor?.renderLine ?? diffScrollRef.current?.scrollTop ?? 0
			const nextHunk =
				direction > 0 ? (diffHunks.find((hunk) => hunk.renderLine > currentLine) ?? null) : ([...diffHunks].reverse().find((hunk) => hunk.renderLine < currentLine) ?? null)
			if (!nextHunk) return
			const targetSide = diffPreferredSide ?? selectedDiffCommentAnchor?.side ?? "RIGHT"
			const nextAnchor =
				diffCommentAnchors.find((anchor) => anchor.renderLine === nextHunk.renderLine && anchor.side === targetSide) ??
				diffCommentAnchors.find((anchor) => anchor.renderLine === nextHunk.renderLine) ??
				diffCommentAnchors.find((anchor) => anchor.fileIndex === nextHunk.fileIndex && anchor.renderLine >= nextHunk.renderLine) ??
				null
			if (!nextAnchor) {
				setDiffFileIndex(nextHunk.fileIndex)
				ensureDiffLineVisible(nextHunk.renderLine)
				return
			}
			setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
			setDiffFileIndex(nextAnchor.fileIndex)
			ensureDiffLineVisible(nextAnchor.renderLine)
		},
		[diffCommentAnchors, diffHunks, diffPreferredSide, ensureDiffLineVisible, selectedDiffCommentAnchor, setDiffFileIndex],
	)

	const selectedDiffHunk = useMemo(() => {
		const visibleFileIndex = Math.max(0, stackedDiffFileIndexAtLine(stackedDiffFiles, diffScrollTop))
		const currentLine = selectedDiffCommentAnchor?.fileIndex === visibleFileIndex ? selectedDiffCommentAnchor.renderLine : diffScrollTop
		const visibleFileHunks = diffHunks.filter((hunk) => hunk.fileIndex === visibleFileIndex)
		return (
			visibleFileHunks.find((hunk, index) => {
				const next = visibleFileHunks[index + 1]
				return currentLine >= hunk.renderLine && (next ? currentLine < next.renderLine : true)
			}) ??
			visibleFileHunks.find((hunk) => hunk.renderLine >= currentLine) ??
			visibleFileHunks[visibleFileHunks.length - 1] ??
			null
		)
	}, [diffHunks, diffScrollTop, selectedDiffCommentAnchor, stackedDiffFiles])

	const selectedHunkStatus = useMemo<HunkStatus | null>(() => {
		if (!selectedDiffHunk) return null
		if (!AsyncResult.isSuccess(unstagedDiffResult) || !AsyncResult.isSuccess(stagedDiffResult)) return null
		const displayedFile = displayFiles[selectedDiffHunk.fileIndex]
		const displayedHunk = displayedFileHunks[selectedDiffHunk.fileIndex]?.find((hunk) => hunk.localRenderLine === selectedDiffHunk.localRenderLine)
		if (!displayedFile || !displayedHunk) return null
		return resolveHunkStatus({ displayedFile, displayedHunk, unstagedPatch, stagedPatch }).status
	}, [displayFiles, displayedFileHunks, selectedDiffHunk, stagedDiffResult, stagedPatch, unstagedDiffResult, unstagedPatch])

	const toggleSelectedHunkStage = useCallback(() => {
		const currentHunk = selectedDiffHunk
		if (!currentHunk) {
			flashNotice("No hunk selected")
			return
		}

		const displayedFile = displayFiles[currentHunk.fileIndex]
		const displayedHunk = displayedFileHunks[currentHunk.fileIndex]?.find((hunk) => hunk.localRenderLine === currentHunk.localRenderLine)
		if (!displayedFile || !displayedHunk) {
			flashNotice("Could not resolve hunk")
			return
		}

		void Promise.all([readUnstagedDiff(undefined), readStagedDiff(undefined)])
			.then(([unstagedPatch, stagedPatch]) => {
				const resolved = resolveHunkStageAction({ displayedFile, displayedHunk, unstagedPatch, stagedPatch })
				if (!resolved) {
					flashNotice("Hunk could not be staged or unstaged safely")
					return
				}
				const apply = resolved.action === "stage" ? stagePatch : unstagePatch
				return apply(resolved.patch).then(() => {
					refreshDiff()
					refreshUnstagedDiff()
					refreshStagedDiff()
					refreshRepoName()
					refreshBranch()
					flashNotice(resolved.action === "stage" ? "Staged hunk" : "Unstaged hunk")
				})
			})
			.catch((error) => flashNotice(errorMessage(error)))
	}, [
		selectedDiffHunk,
		displayFiles,
		displayedFileHunks,
		readUnstagedDiff,
		readStagedDiff,
		refreshUnstagedDiff,
		refreshStagedDiff,
		flashNotice,
		stagePatch,
		unstagePatch,
		refreshDiff,
		refreshRepoName,
		refreshBranch,
	])

	const openDiffCommentModal = useCallback(() => {
		setVimInsertMode(vimModeEnabled)
		setCommentModal({ ...initialCommentModalState, target: { kind: "diff" } })
		setActiveModal("comment")
	}, [vimModeEnabled])

	const openReplyToSelectedComment = useCallback(() => {
		const comment = selectedDiffCommentThread[selectedDiffCommentThread.length - 1]
		const anchorLabel = selectedDiffCommentLabel ?? "Selected thread"
		if (!comment) return
		setCommentThreadModal(initialCommentThreadModalState)
		setVimInsertMode(vimModeEnabled)
		setCommentModal({ ...initialCommentModalState, target: { kind: "reply", inReplyTo: comment.id, anchorLabel } })
		setActiveModal("comment")
	}, [selectedDiffCommentLabel, selectedDiffCommentThread, vimModeEnabled])

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

	const openCommentsOverview = useCallback(() => {
		setVimInsertMode(false)
		setCommentsOverviewModal(initialCommentsOverviewModalState)
		setActiveModal("commentsOverview")
	}, [])

	const moveCommentsOverviewSelection = useCallback(
		(delta: number) => setCommentsOverviewModal((current) => ({ ...current, selectedIndex: wrapIndex(current.selectedIndex + delta, Math.max(1, localComments.length)) })),
		[localComments.length],
	)

	const copyAllComments = useCallback(() => {
		if (localComments.length === 0) return
		void copyText(formatCommentsForClipboard(localComments))
			.then(() => flashNotice(localComments.length === 1 ? "Copied 1 comment" : `Copied ${localComments.length} comments`))
			.catch((error) => flashNotice(errorMessage(error)))
	}, [copyText, flashNotice, localComments])

	const deleteSelectedComment = useCallback(() => {
		if (localComments.length === 0) return
		const index = Math.max(0, Math.min(commentsOverviewModal.selectedIndex, localComments.length - 1))
		const comment = localComments[index]
		if (!comment) return
		void deleteLocalDiffComment(comment.id)
			.then(() => {
				setCommentsOverviewModal((current) => ({ ...current, selectedIndex: Math.max(0, Math.min(current.selectedIndex, localComments.length - 2)) }))
				refreshLocalComments()
				flashNotice("Deleted comment")
			})
			.catch((error) => flashNotice(errorMessage(error)))
	}, [commentsOverviewModal.selectedIndex, deleteLocalDiffComment, flashNotice, localComments, refreshLocalComments])

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
		void appendLocalDiffComment({
			path: target.path,
			line: target.line,
			side: target.side,
			body,
			author: "you",
			inReplyTo,
			...(startLine === undefined ? {} : { startLine }),
			...(startSide === undefined ? {} : { startSide }),
		})
			.then(() => {
				setCommentModal(initialCommentModalState)
				setDiffCommentRangeStartIndex(null)
				refreshLocalComments()
				flashNotice(`Commented on ${target.path}:${target.line}`)
			})
			.catch((error) => {
				flashNotice(errorMessage(error))
			})
	}, [
		appendLocalDiffComment,
		closeActiveModal,
		commentModal.body,
		commentModal.target.kind,
		diffCommentRangeStartAnchor,
		flashNotice,
		refreshLocalComments,
		selectedDiffCommentAnchor,
	])

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
			defineCommand({ id: "diff.comment", title: "Comment on Selected Line", scope: "Diff", shortcut: vimModeEnabled ? "i" : "enter", run: openSelectedDiffComment }),
			defineCommand({ id: "diff.range", title: "Toggle Comment Range", scope: "Diff", shortcut: vimModeEnabled ? "V" : "v", run: toggleDiffCommentRange }),
			defineCommand({ id: "diff.comments-overview", title: "All Comments", scope: "Comments", shortcut: "I", run: openCommentsOverview }),
			defineCommand({ id: "vim-mode.toggle", title: `Vim Mode: ${vimModeEnabled ? "Off" : "On"}`, scope: "View", run: toggleVimMode }),
			defineCommand({ id: "diff.previous-hunk", title: "Previous Hunk", scope: "Navigation", shortcut: diffHunkKeys.previous[0], run: () => moveDiffHunk(-1) }),
			defineCommand({ id: "diff.next-hunk", title: "Next Hunk", scope: "Navigation", shortcut: diffHunkKeys.next[0], run: () => moveDiffHunk(1) }),
			defineCommand({ id: "diff.toggle-hunk-stage", title: `Hunk: ${selectedHunkStatus ?? "Unknown"}`, scope: "Diff", shortcut: "a", run: toggleSelectedHunkStage }),
			defineCommand({
				id: "diff.toggle-view",
				title: `Diff View: ${diffRenderView === "split" ? "Unified" : "Split"}`,
				scope: "Diff",
				shortcut: vimModeEnabled ? "s" : "V",
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
					setVimInsertMode(false)
					setChangedFilesModal({ ...initialChangedFilesModalState, selectedIndex: safeDiffFileIndex(displayFiles, diffFileIndex) })
					setActiveModal("changedFiles")
				},
			}),
			defineCommand({
				id: "view.themes",
				title: "Themes",
				scope: "View",
				run: () => {
					setVimInsertMode(false)
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
					refreshUnstagedDiff()
					refreshStagedDiff()
					refreshRepoName()
					refreshBranch()
				},
			}),
			defineCommand({ id: "yadv.quit", title: "Quit", scope: "System", shortcut: "q", run: () => renderer.destroy() }),
		],
		[
			diffFileIndex,
			diffRenderView,
			diffWhitespaceMode,
			diffWrapMode,
			displayFiles,
			moveDiffHunk,
			openCommentsOverview,
			openSelectedDiffComment,
			openThemeModal,
			refreshBranch,
			refreshDiff,
			refreshRepoName,
			refreshStagedDiff,
			refreshUnstagedDiff,
			renderer,
			selectedHunkStatus,
			toggleDiffCommentRange,
			toggleSelectedHunkStage,
			toggleVimMode,
			vimModeEnabled,
		],
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
			if ((!vimModeEnabled || vimInsertMode) && isSingleLineInputKey(key))
				setCommandPalette((current) => ({ ...current, query: editSingleLineInput(current.query, key) ?? current.query, selectedIndex: 0 }))
			return
		}
		if (activeModal === "comment") return
		if (activeModal === "changedFiles") {
			if ((!vimModeEnabled || vimInsertMode) && isSingleLineInputKey(key))
				setChangedFilesModal((current) => ({ ...current, query: editSingleLineInput(current.query, key) ?? current.query, selectedIndex: 0 }))
			return
		}
		if (activeModal === "theme" && themeModal.filterMode) {
			if ((!vimModeEnabled || vimInsertMode) && isSingleLineInputKey(key)) editThemeQuery((query) => editSingleLineInput(query, key) ?? query)
			return
		}
	})

	useKeymap(
		appKeymap,
		{
			changedFilesModalActive: activeModal === "changedFiles",
			commentModalActive: activeModal === "comment",
			commentThreadModalActive: activeModal === "commentThread",
			commentsOverviewModalActive: activeModal === "commentsOverview",
			themeModalActive: activeModal === "theme",
			commandPaletteActive: activeModal === "commandPalette",
			textInputActive:
				(!vimModeEnabled || vimInsertMode) &&
				(activeModal === "comment" || activeModal === "commandPalette" || activeModal === "changedFiles" || (activeModal === "theme" && themeModal.filterMode)),
			changedFilesModal: buildChangedFilesModalCtx({
				vimModeEnabled,
				vimInsertMode,
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
				enterVimInsertMode,
				leaveVimInsertMode,
			}),
			themeModal: buildThemeModalCtx({
				vimModeEnabled,
				vimInsertMode,
				themeModal,
				closeThemeModal,
				updateThemeQuery,
				toggleThemeMode,
				toggleThemeTone,
				moveThemeSelection,
				enterVimInsertMode,
				leaveVimInsertMode,
			}),
			commandPalette: buildCommandPaletteCtx({
				vimModeEnabled,
				vimInsertMode,
				closeActiveModal,
				selectedCommand,
				runCommandPaletteCommand: runCommand,
				moveCommandPaletteSelection: (delta) =>
					setCommandPalette((current) => ({ ...current, selectedIndex: wrapIndex(current.selectedIndex + delta, Math.max(1, filteredCommands.length)) })),
				enterVimInsertMode,
				leaveVimInsertMode,
			}),
			commentModal: { vimModeEnabled, vimInsertMode, closeModal: closeActiveModal, submitComment: submitCommentModal, enterInsertMode: enterVimInsertMode },
			commentThreadModal: {
				halfPage: Math.max(1, Math.floor(height / 2)),
				closeModal: closeActiveModal,
				openInlineComment: openReplyToSelectedComment,
				scrollBy: (delta) => setCommentThreadModal((current) => ({ ...current, scrollOffset: Math.max(0, current.scrollOffset + delta) })),
			},
			commentsOverviewModal: {
				hasComments: localComments.length > 0,
				closeModal: closeActiveModal,
				move: moveCommentsOverviewSelection,
				copyAll: copyAllComments,
				deleteSelected: deleteSelectedComment,
			},
			diff: {
				vimModeEnabled,
				halfPage: Math.max(1, Math.floor(height / 2)),
				handleEscape: () => {
					if (diffCommentRangeStartIndex !== null) setDiffCommentRangeStartIndex(null)
					else closeActiveModal()
				},
				openSelectedComment: openSelectedDiffComment,
				openCommentsOverview,
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
					setVimInsertMode(false)
					setChangedFilesModal({ ...initialChangedFilesModalState, selectedIndex: safeDiffFileIndex(displayFiles, diffFileIndex) })
					setActiveModal("changedFiles")
				},
				nextFile: () => selectDiffFile(diffFileIndex + 1),
				previousFile: () => selectDiffFile(diffFileIndex - 1),
				nextHunk: () => moveDiffHunk(1),
				previousHunk: () => moveDiffHunk(-1),
				toggleSelectedHunkStage,
			},
			openCommandPalette: () => {
				setVimInsertMode(false)
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
					selectedHunkStatus={selectedHunkStatus}
					onSelectCommentLine={selectDiffCommentLine}
					themeId={themeId}
					themeGeneration={systemThemeGeneration}
				/>
				{activeModal === "changedFiles" ? (
					<ChangedFilesModal
						state={changedFilesModal}
						results={changedFileResults}
						totalCount={displayFiles.length}
						vimModeEnabled={vimModeEnabled}
						vimInsertMode={vimInsertMode}
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
						vimModeEnabled={vimModeEnabled}
						vimInsertMode={vimInsertMode}
						modalWidth={modalWidth}
						modalHeight={modalHeight}
						offsetLeft={modalOffsetLeft}
						offsetTop={modalOffsetTop}
						onSelectCommandIndex={(index) => setCommandPalette((current) => ({ ...current, selectedIndex: index }))}
						onRunCommand={runCommand}
					/>
				) : null}
				{activeModal === "theme" ? (
					<ThemeModal
						state={themeModal}
						vimModeEnabled={vimModeEnabled}
						vimInsertMode={vimInsertMode}
						modalWidth={modalWidth}
						modalHeight={modalHeight}
						offsetLeft={modalOffsetLeft}
						offsetTop={modalOffsetTop}
					/>
				) : null}
				{activeModal === "comment" ? (
					<CommentModal
						state={commentModal}
						anchorLabel={selectedDiffCommentAnchor ? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel ?? ""}`.trim() : "No diff line selected"}
						modalWidth={modalWidth}
						modalHeight={modalHeight}
						offsetLeft={modalOffsetLeft}
						offsetTop={modalOffsetTop}
						vimModeEnabled={vimModeEnabled}
						vimInsertMode={vimInsertMode}
						onChange={setCommentEditorValue}
						onSubmit={submitCommentModal}
					/>
				) : null}
				{activeModal === "commentThread" ? (
					<CommentThreadModal
						state={commentThreadModal}
						anchorLabel={selectedDiffCommentAnchor ? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel ?? ""}`.trim() : "Selected thread"}
						comments={selectedDiffCommentThread}
						modalWidth={modalWidth}
						modalHeight={Math.min(height - 4, 22)}
						offsetLeft={modalOffsetLeft}
						offsetTop={Math.max(0, centeredOffset(height, Math.min(height - 4, 22)))}
					/>
				) : null}
				{activeModal === "commentsOverview" ? (
					<CommentsOverviewModal
						state={commentsOverviewModal}
						comments={localComments}
						modalWidth={modalWidth}
						modalHeight={Math.min(height - 4, 22)}
						offsetLeft={modalOffsetLeft}
						offsetTop={Math.max(0, centeredOffset(height, Math.min(height - 4, 22)))}
					/>
				) : null}
			</box>
			<PlainLine
				text={centerCell(
					notice ??
						(vimModeEnabled
							? "vim on   i comment   V range   a stage   s view   { } hunks   f files   w wrap   W whitespace   ctrl-p commands   q quit"
							: "enter comment   v range   a stage   I comments   f files   V view   w wrap   W whitespace   r reload   ctrl-p commands   q quit"),
					width,
				)}
				fg={notice ? colors.text : colors.muted}
			/>
		</box>
	)
}
