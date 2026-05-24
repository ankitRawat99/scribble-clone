import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import type { ChatMessage } from "../../game/game.types";

interface ChatPanelProps {
  messages: ChatMessage[];
  canGuess: boolean;
  onSubmitGuess: (guess: string) => void;
}

function ChatPanel({ messages, canGuess, onSubmitGuess }: ChatPanelProps) {
  const [guess, setGuess] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canGuess || guess.trim().length === 0) return;

    onSubmitGuess(guess.trim());
    setGuess("");
  };

  return (
    <section className="chat-panel glass-panel">
      <div className="panel-title">
        <span>Guess Feed</span>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="empty-state">Guesses will appear here.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`chat-message chat-${message.type}`}>
            <strong>{message.playerName}</strong>
            <span>{message.message}</span>
          </div>
        ))}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={guess}
          onChange={(event) => setGuess(event.target.value)}
          placeholder={canGuess ? "Type a guess" : "Drawer cannot guess"}
          disabled={!canGuess}
        />
        <Button type="submit" variant="secondary" disabled={!canGuess}>
          Send
        </Button>
      </form>
    </section>
  );
}

export default ChatPanel;
