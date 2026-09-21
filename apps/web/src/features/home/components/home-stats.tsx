import { CheckCircle2, Database, Users } from 'lucide-react';
import type { CompanyStats } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

const nf = new Intl.NumberFormat('ru-RU');

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="node-panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-label font-semibold tracking-[0.08em] uppercase">{label}</span>
      </div>
      <div className="mt-3 font-mono text-stat leading-none font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

/** Показатели компании на главной: люди, проекты, накопленные данные. */
export function HomeStats({ stats }: { stats: CompanyStats }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        icon={<Users className="size-4" strokeWidth={1.75} />}
        label={ui.home.statsEmployees}
        value={nf.format(stats.employeeCount)}
      />
      <StatCard
        icon={<CheckCircle2 className="size-4" strokeWidth={1.75} />}
        label={ui.home.statsProjectsDone}
        value={nf.format(stats.projectsDone)}
      />
      <StatCard
        icon={<Database className="size-4" strokeWidth={1.75} />}
        label={ui.home.statsDataNodes}
        value={nf.format(stats.dataNodes)}
      />
    </div>
  );
}
