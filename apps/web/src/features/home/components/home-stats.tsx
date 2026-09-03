import { Banknote, CheckCircle2, Database, Users } from 'lucide-react';
import type { CompanyStats } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

const nf = new Intl.NumberFormat('ru-RU');

function StatCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="paper-card p-4">
      <div className="flex items-center gap-2 text-xs text-card-foreground/60">
        <span
          className={cn('crayon-fill flex size-7 items-center justify-center rounded-md', tone)}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-rust tabular-nums">{value}</div>
    </div>
  );
}

/** Показатели компании на главной: люди, проекты, выручка, накопленные данные. */
export function HomeStats({ stats }: { stats: CompanyStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        icon={<Users className="size-4" />}
        tone="bg-tealink/15 text-tealink"
        label={ui.home.statsEmployees}
        value={nf.format(stats.employeeCount)}
      />
      <StatCard
        icon={<CheckCircle2 className="size-4" />}
        tone="bg-sage/20 text-sage"
        label={ui.home.statsProjectsDone}
        value={nf.format(stats.projectsDone)}
      />
      <StatCard
        icon={<Banknote className="size-4" />}
        tone="bg-ochre/20 text-ochre"
        label={ui.home.statsRevenue}
        value={`${nf.format(Math.round(stats.revenueByn / 1_000_000))} млн BYN`}
      />
      <StatCard
        icon={<Database className="size-4" />}
        tone="bg-steel/20 text-steel"
        label={ui.home.statsDataNodes}
        value={nf.format(stats.dataNodes)}
      />
    </div>
  );
}
