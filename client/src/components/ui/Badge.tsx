import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  tone?: "cyan" | "lime" | "amber" | "muted";
}

function Badge({ children, tone = "muted" }: BadgeProps) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export default Badge;
