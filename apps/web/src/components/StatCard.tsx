type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "violet" | "amber" | "emerald";
};

export function StatCard({ label, value, detail, tone }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__detail">{detail}</p>
    </article>
  );
}
