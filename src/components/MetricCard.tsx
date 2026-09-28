import Link from "next/link";

export function MetricCard({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link href={href} className="bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-foreground-muted mt-0.5">{label}</div>
    </Link>
  );
}
