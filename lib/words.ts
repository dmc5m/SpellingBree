// Weekly UFLI word lists — update this file when David brings new words.
// Each level is a set of words that share a spelling pattern.
const WORDS = {
  1: ["polar", "nectar", "collar", "author", "harbor", "actor"],
  2: ["factor", "dollar", "wizard", "lizard", "whom"],
} as const satisfies Record<number, readonly string[]>

export function getMaxLevel(): number {
  return Object.keys(WORDS).length
}

export function getRandomWord(level: number): string {
  const levelWords = WORDS[level as keyof typeof WORDS]
  if (!levelWords) return WORDS[1][0]
  return levelWords[Math.floor(Math.random() * levelWords.length)]
}
