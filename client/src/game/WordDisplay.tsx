import type { WordState } from "./game.types";

interface WordDisplayProps {
  wordState: WordState;
}

function WordDisplay({ wordState }: WordDisplayProps) {
  const word = wordState.word || "Waiting for word";

  return (
    <div className={`word-display ${wordState.isDrawer ? "drawer-word" : "guesser-word"}`}>
      <span className="word-label">{wordState.isDrawer ? "Your word" : "Word"}</span>
      <strong>{wordState.isDrawer ? word.toUpperCase() : word}</strong>
    </div>
  );
}

export default WordDisplay;
