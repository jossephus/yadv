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
		readonly unstagedDiff: () => Effect.Effect<string, CommandError>
		readonly stagedDiff: () => Effect.Effect<string, CommandError>
		readonly stagePatch: (patch: string) => Effect.Effect<void, CommandError>
		readonly unstagePatch: (patch: string) => Effect.Effect<void, CommandError>
	}
>()("yadv/GitService") {
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

			const unstagedDiff = Effect.fn("GitService.unstagedDiff")(function* () {
				const result = yield* command.run("git", ["diff"])
				return result.stdout.trimEnd()
			})

			const stagedDiff = Effect.fn("GitService.stagedDiff")(function* () {
				const result = yield* command.run("git", ["diff", "--cached"])
				return result.stdout.trimEnd()
			})

			const stagePatch = Effect.fn("GitService.stagePatch")(function* (patch: string) {
				yield* command.run("git", ["apply", "--cached", "--unidiff-zero", "-"], { stdin: `${patch}\n` })
			})

			const unstagePatch = Effect.fn("GitService.unstagePatch")(function* (patch: string) {
				yield* command.run("git", ["apply", "--cached", "-R", "--unidiff-zero", "-"], { stdin: `${patch}\n` })
			})

			return GitService.of({ repoRoot, repoName, currentBranch, workingTreeDiff, unstagedDiff, stagedDiff, stagePatch, unstagePatch })
		}),
	)
}
