interface RoundRevealProps {
  revealedWord: string | null;
}

function RoundReveal({ revealedWord }: RoundRevealProps) {
  return (
    <div className="round-reveal glass-panel">
      <span className="eyebrow">Round complete</span>
      <h2>{revealedWord ? `The word was ${revealedWord.toUpperCase()}` : "Revealing word..."}</h2>
      <p className="empty-state">Next drawer is coming up.</p>
    </div>
  );
}

export default RoundReveal;
