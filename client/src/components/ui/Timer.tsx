interface TimerProps {
  remainingSeconds: number;
}

function Timer({ remainingSeconds }: TimerProps) {
  const isUrgent = remainingSeconds <= 10;

  return (
    <div className={`timer-pill ${isUrgent ? "timer-urgent" : ""}`}>
      <span>Time</span>
      <strong>{remainingSeconds}s</strong>
    </div>
  );
}

export default Timer;
