import { Config, Effect } from "effect"

const positiveIntOr = (fallback: number) => (value: number) => (Number.isFinite(value) && value > 0 ? value : fallback)

const appConfig = Config.all({
	commandTimeoutMs: Config.int("YADV_COMMAND_TIMEOUT_MS").pipe(Config.withDefault(15_000), Config.map(positiveIntOr(15_000))),
})

export const config = Effect.runSync(
	Effect.gen(function* () {
		return yield* appConfig
	}),
)
