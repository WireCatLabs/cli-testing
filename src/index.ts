export const SUITE_GROUPS = ["security", "contract", "performance", "ux", "analyzers", "live", "seed"] as const

export type SuiteGroup = (typeof SUITE_GROUPS)[number]
