import { Context, Effect, Layer, Ref } from "effect"
import { type CreateLocalDiffCommentInput, type LocalDiffComment } from "../localComments.js"

export class LocalCommentsService extends Context.Service<
	LocalCommentsService,
	{
		readonly listComments: () => Effect.Effect<readonly LocalDiffComment[]>
		readonly appendComment: (input: CreateLocalDiffCommentInput) => Effect.Effect<LocalDiffComment>
		readonly deleteComment: (id: string) => Effect.Effect<void>
		readonly clearComments: () => Effect.Effect<void>
	}
>()("yadv/LocalCommentsService") {
	static readonly layerNoDeps = Layer.effect(
		LocalCommentsService,
		Effect.gen(function* () {
			// Comments live in memory for the lifetime of the process only. They are
			// never written to disk, so nothing leaks into the working tree or needs
			// gitignoring, and quitting yadv resets them.
			const store = yield* Ref.make<readonly LocalDiffComment[]>([])

			const listComments = Effect.fn("LocalCommentsService.listComments")(function* () {
				return yield* Ref.get(store)
			})

			const appendComment = Effect.fn("LocalCommentsService.appendComment")(function* (input: CreateLocalDiffCommentInput) {
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
				yield* Ref.update(store, (comments) => [...comments, comment])
				return comment
			})

			const deleteComment = Effect.fn("LocalCommentsService.deleteComment")(function* (id: string) {
				// Drop the comment and any replies that hang off it.
				yield* Ref.update(store, (comments) => comments.filter((comment) => comment.id !== id && comment.inReplyTo !== id))
			})

			const clearComments = Effect.fn("LocalCommentsService.clearComments")(function* () {
				yield* Ref.set(store, [])
			})

			return LocalCommentsService.of({ listComments, appendComment, deleteComment, clearComments })
		}),
	)
}
