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
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className={cn('flex size-7 items-center justify-center rounded-lg', tone)}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

/** Показатели компании на главной: люди, проекты, выручка, накопленные данные. */
export function HomeStats({ stats }: { stats: CompanyStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        icon={<Users className="size-4" />}
        tone="bg-teal-400/15 text-teal-300"
        label={ui.home.statsEmployees}
        value={nf.format(stats.employeeCount)}
      />
      <StatCard
        icon={<CheckCircle2 className="size-4" />}
        tone="bg-emerald-400/15 text-emerald-300"
        label={ui.home.statsProjectsDone}
        value={nf.format(stats.projectsDone)}
      />
      <StatCard
        icon={<Banknote className="size-4" />}
        tone="bg-amber-400/15 text-amber-300"
        label={ui.home.statsRevenue}
        value={`${nf.format(Math.round(stats.revenueByn / 1_000_000))} млн BYN`}
      />
      <StatCard
        icon={<Database className="size-4" />}
        tone="bg-violet-400/15 text-violet-300"
        label={ui.home.statsDataNodes}
        value={nf.format(stats.dataNodes)}
      />
    </div>
  );
}
