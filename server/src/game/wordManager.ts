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

export function getHiddenWord(word: string | null): string {
  if (!word) return "";

  return word
    .split("")
    .map((character) => (character === " " ? " " : "_"))
    .join(" ");
}
