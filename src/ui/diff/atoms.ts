import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Clipboard } from "../../services/Clipboard.js"
import { GitService } from "../../services/GitService.js"
import { LocalCommentsService } from "../../services/LocalCommentsService.js"
import { loadStoredDiffWhitespaceMode } from "../../themeStore.js"
import { gitRuntime } from "../../services/runtime.js"
import { splitPatchFiles, type DiffView, type DiffWhitespaceMode, type DiffWrapMode } from "../diff.js"
import type { CreateLocalDiffCommentInput } from "../../localComments.js"

export const initialDiffWhitespaceMode = await Effect.runPromise(loadStoredDiffWhitespaceMode)

export const diffFileIndexAtom = Atom.make(0)
export const diffScrollTopAtom = Atom.make(0)
export const diffRenderViewAtom = Atom.make<DiffView>("split")
export const diffWrapModeAtom = Atom.make<DiffWrapMode>("none")
export const diffWhitespaceModeAtom = Atom.make<DiffWhitespaceMode>(initialDiffWhitespaceMode)

export const workingTreeDiffAtom = gitRuntime.atom(
	GitService.use((git) =>
		git.workingTreeDiff().pipe(
			Effect.map((patch) => ({
				patch,
				files: splitPatchFiles(patch),
			})),
		),
	),
)

export const repoRootAtom = gitRuntime.atom(GitService.use((git) => git.repoRoot()))
export const repoNameAtom = gitRuntime.atom(GitService.use((git) => git.repoName()))
export const currentBranchAtom = gitRuntime.atom(GitService.use((git) => git.currentBranch()))
export const localDiffCommentsAtom = gitRuntime.atom(LocalCommentsService.use((comments) => comments.listComments()))
export const appendLocalDiffCommentAtom = gitRuntime.fn<CreateLocalDiffCommentInput>()((input) => LocalCommentsService.use((comments) => comments.appendComment(input)))
export const deleteLocalDiffCommentAtom = gitRuntime.fn<string>()((id) => LocalCommentsService.use((comments) => comments.deleteComment(id)))
export const copyTextAtom = gitRuntime.fn<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
