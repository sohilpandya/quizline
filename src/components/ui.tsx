export const OPTION_STYLES = [
  { bg: "bg-rose-500", shape: "▲" },
  { bg: "bg-sky-500", shape: "◆" },
  { bg: "bg-amber-400", shape: "●" },
  { bg: "bg-emerald-500", shape: "■" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      Quiz<span className="text-fuchsia-400">line</span>
    </span>
  );
}

export function TimerBar({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-100 ease-linear ${left < 4 ? "bg-rose-500" : "bg-fuchsia-400"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const AGENT_STYLE = {
  quiz: { label: "Quiz Master", cls: "bg-fuchsia-500/20 text-fuchsia-300" },
  merch: { label: "Merch agent", cls: "bg-amber-500/20 text-amber-300" },
  fan: { label: "Fan agent", cls: "bg-emerald-500/20 text-emerald-300" },
} as const;

export function AgentBadge({ agent }: { agent: keyof typeof AGENT_STYLE }) {
  const s = AGENT_STYLE[agent];
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}
