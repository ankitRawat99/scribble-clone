const WORDS = [
  "apple",
  "car",
  "house",
  "guitar",
  "pizza",
  "rocket",
  "camera",
  "bridge",
  "castle",
  "penguin",
  "bicycle",
  "flower",
];

export function getRandomWord(): string {
  const index = Math.floor(Math.random() * WORDS.length);
  return WORDS[index]!;
}

export function getRandomWordOptions(count: number): string[] {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, WORDS.length));
}

export function getHiddenWord(word: string | null): string {
  if (!word) return "";

  return word
    .split("")
    .map((character) => (character === " " ? " " : "_"))
    .join(" ");
}
