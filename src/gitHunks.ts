import type { DiffFileHunk, DiffFilePatch } from "./ui/diff.js"
import { getDiffFileHunks, splitPatchFiles } from "./ui/diff.js"

export type HunkStageAction = "stage" | "unstage"
export type HunkStatus = "unstaged" | "staged" | "mixed" | "unknown"

export interface ResolvedHunkStageAction {
	readonly action: HunkStageAction
	readonly patch: string
}

export interface ResolvedHunkStatus {
	readonly status: HunkStatus
	readonly stagePatch: string | null
	readonly unstagePatch: string | null
}

const hunkContextLabel = (header: string) => {
	const match = header.match(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(.*)$/)
	return (match?.[1] ?? "").trim()
}

const sameHunk = (left: DiffFileHunk, right: DiffFileHunk) => {
	if (left.body.join("\n") !== right.body.join("\n")) return false
	const leftContext = hunkContextLabel(left.header)
	const rightContext = hunkContextLabel(right.header)
	return leftContext === rightContext
}

const matchingHunkPatch = (patch: string, displayedFile: DiffFilePatch, displayedHunk: DiffFileHunk) => {
	const file = splitPatchFiles(patch).find((candidate) => candidate.name === displayedFile.name)
	if (!file) return null
	const match = getDiffFileHunks(file).find((hunk) => sameHunk(hunk, displayedHunk))
	return match?.patch ?? null
}

export const resolveHunkStageAction = ({
	displayedFile,
	displayedHunk,
	unstagedPatch,
	stagedPatch,
}: {
	displayedFile: DiffFilePatch
	displayedHunk: DiffFileHunk
	unstagedPatch: string
	stagedPatch: string
}): ResolvedHunkStageAction | null => {
	const resolved = resolveHunkStatus({ displayedFile, displayedHunk, unstagedPatch, stagedPatch })
	if (resolved.status === "mixed" || resolved.status === "unknown") return null
	if (resolved.status === "unstaged" && resolved.stagePatch) return { action: "stage", patch: resolved.stagePatch }
	if (resolved.status === "staged" && resolved.unstagePatch) return { action: "unstage", patch: resolved.unstagePatch }
	return null
}

export const resolveHunkStatus = ({
	displayedFile,
	displayedHunk,
	unstagedPatch,
	stagedPatch,
}: {
	displayedFile: DiffFilePatch
	displayedHunk: DiffFileHunk
	unstagedPatch: string
	stagedPatch: string
}): ResolvedHunkStatus => {
	const stagePatch = matchingHunkPatch(unstagedPatch, displayedFile, displayedHunk)
	const unstagePatch = matchingHunkPatch(stagedPatch, displayedFile, displayedHunk)
	return {
		status: stagePatch && unstagePatch ? "mixed" : stagePatch ? "unstaged" : unstagePatch ? "staged" : "unknown",
		stagePatch,
		unstagePatch,
	}
}
