import type { ThemeConfig, ThemeMode } from "../../themeConfig.js"
import type { ThemeId, ThemeTone } from "../colors.js"

export type CommentModalTarget =
	| { readonly kind: "diff" }
	| { readonly kind: "reply"; readonly inReplyTo: string; readonly anchorLabel: string }
	| { readonly kind: "edit"; readonly commentId: string; readonly anchorLabel: string }

export interface ChangedFilesModalState {
	readonly query: string
	readonly selectedIndex: number
}

export interface CommentModalState {
	readonly body: string
	readonly cursor: number
	readonly error: string | null
	readonly target: CommentModalTarget
}

export interface CommentThreadModalState {
	readonly scrollOffset: number
}

export interface ThemeModalState {
	readonly query: string
	readonly filterMode: boolean
	readonly mode: ThemeMode
	readonly tone: ThemeTone
	readonly fixedTheme: ThemeId
	readonly darkTheme: ThemeId
	readonly lightTheme: ThemeId
	readonly initialThemeConfig: ThemeConfig
}

export interface CommandPaletteState {
	readonly query: string
	readonly selectedIndex: number
}

export const initialChangedFilesModalState: ChangedFilesModalState = {
	query: "",
	selectedIndex: 0,
}

export const initialCommentModalState: CommentModalState = {
	body: "",
	cursor: 0,
	error: null,
	target: { kind: "diff" },
}

export const initialCommentThreadModalState: CommentThreadModalState = {
	scrollOffset: 0,
}

export const initialThemeModalState: ThemeModalState = {
	query: "",
	filterMode: false,
	mode: "fixed",
	tone: "dark",
	fixedTheme: "ghui",
	darkTheme: "ghui",
	lightTheme: "catppuccin-latte",
	initialThemeConfig: { mode: "fixed", theme: "ghui" },
}

export const initialCommandPaletteState: CommandPaletteState = {
	query: "",
	selectedIndex: 0,
}
