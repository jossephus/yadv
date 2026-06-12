import { join } from "node:path"
import { Context, Effect, Layer, Schema } from "effect"
import type { DiffCommentSide } from "../domain.js"
import { errorMessage } from "../errors.js"
import { type CreateLocalDiffCommentInput, initialLocalCommentsFile, type LocalCommentsFile, type LocalDiffComment } from "../localComments.js"
import { GitService } from "./GitService.js"

class LocalCommentsError extends Schema.TaggedErrorClass<LocalCommentsError>()("LocalCommentsError", {
	message: Schema.String,
}) {}

const commentsFileName = "ghui.json"

const parseCommentsFile = (value: unknown): LocalCommentsFile => {
	if (!value || typeof value !== "object") return initialLocalCommentsFile
	const object = value as { version?: unknown; comments?: unknown }
	if (object.version !== 1 || !Array.isArray(object.comments)) return initialLocalCommentsFile
	const comments = object.comments.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return []
		const comment = entry as Record<string, unknown>
		if (typeof comment.id !== "string") return []
		if (typeof comment.path !== "string") return []
		if (typeof comment.line !== "number") return []
		if (comment.side !== "LEFT" && comment.side !== "RIGHT") return []
		if (typeof comment.author !== "string") return []
		if (typeof comment.body !== "string") return []
		const createdAt = typeof comment.createdAt === "string" ? new Date(comment.createdAt) : null
		return [
			{
				id: comment.id,
				path: comment.path,
				line: comment.line,
				side: comment.side as DiffCommentSide,
				author: comment.author,
				body: comment.body,
				createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : null,
				url: null,
				inReplyTo: typeof comment.inReplyTo === "string" ? comment.inReplyTo : null,
				...(typeof comment.startLine === "number" ? { startLine: comment.startLine } : {}),
				...(comment.startSide === "LEFT" || comment.startSide === "RIGHT" ? { startSide: comment.startSide } : {}),
			} satisfies LocalDiffComment,
		]
	})
	return { version: 1, comments }
}

const serializeCommentsFile = (file: LocalCommentsFile) => ({
	version: 1 as const,
	comments: file.comments.map((comment) => ({
		id: comment.id,
		path: comment.path,
		line: comment.line,
		side: comment.side,
		author: comment.author,
		body: comment.body,
		createdAt: comment.createdAt?.toISOString() ?? null,
		inReplyTo: comment.inReplyTo,
		...(comment.startLine === undefined ? {} : { startLine: comment.startLine }),
		...(comment.startSide === undefined ? {} : { startSide: comment.startSide }),
	})),
})

export class LocalCommentsService extends Context.Service<
	LocalCommentsService,
	{
		readonly listComments: () => Effect.Effect<readonly LocalDiffComment[], LocalCommentsError>
		readonly appendComment: (input: CreateLocalDiffCommentInput) => Effect.Effect<LocalDiffComment, LocalCommentsError>
	}
>()("ghui/LocalCommentsService") {
	static readonly layerNoDeps = Layer.effect(
		LocalCommentsService,
		Effect.gen(function* () {
			const git = yield* GitService

			const filePath = Effect.fn("LocalCommentsService.filePath")(function* () {
				const root = yield* git.repoRoot().pipe(Effect.mapError((error) => new LocalCommentsError({ message: errorMessage(error) })))
				return join(root, commentsFileName)
			})

			const readFile = Effect.fn("LocalCommentsService.readFile")(function* () {
				const path = yield* filePath()
				return yield* Effect.tryPromise({
					try: async () => {
						const file = Bun.file(path)
						if (!(await file.exists())) return initialLocalCommentsFile
						return parseCommentsFile(await file.json())
					},
					catch: (cause) => new LocalCommentsError({ message: errorMessage(cause) }),
				})
			})

			const writeFile = Effect.fn("LocalCommentsService.writeFile")(function* (file: LocalCommentsFile) {
				const path = yield* filePath()
				return yield* Effect.tryPromise({
					try: async () => {
						await Bun.write(path, `${JSON.stringify(serializeCommentsFile(file), null, 2)}\n`)
					},
					catch: (cause) => new LocalCommentsError({ message: errorMessage(cause) }),
				})
			})

			const listComments = Effect.fn("LocalCommentsService.listComments")(function* () {
				return (yield* readFile()).comments
			})

			const appendComment = Effect.fn("LocalCommentsService.appendComment")(function* (input: CreateLocalDiffCommentInput) {
				const file = yield* readFile()
				const comment = {
					id: crypto.randomUUID(),
					path: input.path,
					line: input.line,
					side: input.side,
					author: input.author,
					body: input.body,
					createdAt: new Date(),
					url: null,
					inReplyTo: input.inReplyTo,
					...(input.startLine === undefined ? {} : { startLine: input.startLine }),
					...(input.startSide === undefined ? {} : { startSide: input.startSide }),
				} satisfies LocalDiffComment
				yield* writeFile({ version: 1, comments: [...file.comments, comment] })
				return comment
			})

			return LocalCommentsService.of({ listComments, appendComment })
		}),
	)
}
