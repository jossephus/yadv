import { Context, Effect, Layer } from "effect"
import type { CommandError } from "./CommandRunner.js"
import { CommandRunner } from "./CommandRunner.js"

const trimTrailingNewline = (value: string) => value.replace(/\r?\n$/, "")

const repoNameFromRoot = (repoRoot: string) => {
	const normalized = repoRoot.replace(/\/+$/, "")
	const segment = normalized.split("/").at(-1)
	return segment && segment.length > 0 ? segment : repoRoot
}

export class GitService extends Context.Service<
	GitService,
	{
		readonly repoRoot: () => Effect.Effect<string, CommandError>
		readonly repoName: () => Effect.Effect<string, CommandError>
		readonly currentBranch: () => Effect.Effect<string, CommandError>
		readonly workingTreeDiff: () => Effect.Effect<string, CommandError>
	}
>()("ghui/GitService") {
	static readonly layerNoDeps = Layer.effect(
		GitService,
		Effect.gen(function* () {
			const command = yield* CommandRunner

			const repoRoot = Effect.fn("GitService.repoRoot")(function* () {
				const result = yield* command.run("git", ["rev-parse", "--show-toplevel"])
				return trimTrailingNewline(result.stdout)
			})

			const repoName = Effect.fn("GitService.repoName")(function* () {
				return repoNameFromRoot(yield* repoRoot())
			})

			const currentBranch = Effect.fn("GitService.currentBranch")(function* () {
				const result = yield* command.run("git", ["rev-parse", "--abbrev-ref", "HEAD"])
				return trimTrailingNewline(result.stdout)
			})

			const workingTreeDiff = Effect.fn("GitService.workingTreeDiff")(function* () {
				const result = yield* command.run("git", ["diff", "HEAD"])
				return result.stdout.trimEnd()
			})

			return GitService.of({ repoRoot, repoName, currentBranch, workingTreeDiff })
		}),
	)
}
