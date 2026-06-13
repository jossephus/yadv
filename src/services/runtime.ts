import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Observability } from "../observability.js"
import { Clipboard } from "./Clipboard.js"
import { CommandRunner } from "./CommandRunner.js"
import { GitService } from "./GitService.js"
import { LocalCommentsService } from "./LocalCommentsService.js"

export const gitRuntime = Atom.runtime(
	Layer.mergeAll(GitService.layerNoDeps, LocalCommentsService.layerNoDeps, Clipboard.layerNoDeps).pipe(
		Layer.provide(CommandRunner.layer),
		Layer.provideMerge(Observability.layer),
	),
)
