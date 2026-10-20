import {
  CalendarClock,
  Calculator,
  ClipboardCheck,
  DraftingCompass,
  FileText,
  Flag,
  MessagesSquare,
  Package,
  PencilRuler,
  SearchCheck,
  Send,
  ShieldCheck,
  SquareCheck,
  Star,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TaskTypeIcon } from '@nodus/contracts';

/** Реестр значков типов задач (#378): закрытый набор ключей lucide из
 *  контракта `taskTypeIconSchema`; новая иконка = расширение набора там
 *  и здесь (рассинхрон — ошибка типов). */
const ICONS: Record<TaskTypeIcon, LucideIcon> = {
  'square-check': SquareCheck,
  zap: Zap,
  'file-text': FileText,
  'pencil-ruler': PencilRuler,
  'clipboard-check': ClipboardCheck,
  send: Send,
  'search-check': SearchCheck,
  wrench: Wrench,
  calculator: Calculator,
  'drafting-compass': DraftingCompass,
  'messages-square': MessagesSquare,
  'calendar-clock': CalendarClock,
  'shield-check': ShieldCheck,
  package: Package,
  flag: Flag,
  star: Star,
};

export function TaskTypeGlyph({ icon, className }: { icon: TaskTypeIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
