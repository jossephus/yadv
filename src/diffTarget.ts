export interface LocalDiffTarget {
	readonly repoName: string
	readonly branch: string
	readonly additions: number
	readonly deletions: number
}
