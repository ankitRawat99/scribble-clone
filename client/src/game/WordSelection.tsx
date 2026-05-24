import Button from "../components/ui/Button";
import type { Room, WordOptionsState } from "./game.types";

interface WordSelectionProps {
  room: Room;
  wordOptions: WordOptionsState;
  remainingSeconds: number;
  isDrawer: boolean;
  onSelectWord: (word: string) => void;
}

function WordSelection({
  room,
  wordOptions,
  remainingSeconds,
  isDrawer,
  onSelectWord,
}: WordSelectionProps) {
  const options = wordOptions.options;

  return (
    <div className="word-selection glass-panel">
      {isDrawer ? (
        <>
          <span className="eyebrow">Choose your word</span>
          <h2>{remainingSeconds}s to pick</h2>
          <div className="word-option-grid">
            {options.map((word) => (
              <Button key={word} type="button" variant="secondary" onClick={() => onSelectWord(word)}>
                {word}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span className="eyebrow">Word selection</span>
          <h2>{room.players.find((player) => player.id === room.currentDrawerId)?.name || "Drawer"} is choosing...</h2>
          <p className="empty-state">The word list is private to the drawer.</p>
        </>
      )}
    </div>
  );
}

export default WordSelection;
