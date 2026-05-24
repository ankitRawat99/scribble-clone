import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  connectionStatus: string;
}

function AppShell({ children, connectionStatus }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="ambient-bg" />
      <div className="connection-pill">{connectionStatus}</div>
      {children}
    </div>
  );
}

export default AppShell;
