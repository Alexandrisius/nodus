import {
  Box,
  Boxes,
  Building,
  Building2,
  Factory,
  Flag,
  Folder,
  FolderTree,
  Landmark,
  Layers,
  ListTree,
  Milestone,
  Route,
  SquareStack,
  type LucideIcon,
} from 'lucide-react';
import type { NodeLevelIcon } from '@nodus/contracts';

/** Реестр значков видов уровней (#467): закрытый набор ключей lucide из
 *  контракта `nodeLevelIconSchema`; новая иконка = расширение набора там и
 *  здесь (рассинхрон — ошибка типов). Паттерн process-type-icon.tsx. */
const ICONS: Record<NodeLevelIcon, LucideIcon> = {
  folder: Folder,
  folderTree: FolderTree,
  layers: Layers,
  building: Building,
  building2: Building2,
  landmark: Landmark,
  boxes: Boxes,
  box: Box,
  listTree: ListTree,
  flag: Flag,
  milestone: Milestone,
  factory: Factory,
  route: Route,
  squareStack: SquareStack,
};

export function NodeLevelGlyph({ icon, className }: { icon: NodeLevelIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/** Ключи реестра для селектов (иконка вида в окнах структуры/справочника). */
export const NODE_LEVEL_ICON_KEYS = Object.keys(ICONS) as NodeLevelIcon[];
