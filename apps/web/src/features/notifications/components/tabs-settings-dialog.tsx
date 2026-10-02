import { useState } from 'react';
import type { NotificationKind, NotificationPriority } from '@nodus/contracts';
import { notificationKindSchema, notificationPrioritySchema, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Checkbox } from '@nodus/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { Label } from '@nodus/ui/components/label';

import type { CustomFeedTab, SystemTabId } from '../model/feed-tabs.js';
import { isValidTabName } from '../model/feed-tabs.js';
import { useNotificationTabsStore } from '../model/tabs-prefs-store.js';

/** Опции фильтра — из контрактов: новые kind/priority попадают сюда сами. */
const PRIORITY_OPTIONS = notificationPrioritySchema.options;
const KIND_OPTIONS = notificationKindSchema.options;

const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  urgent: ui.notifications.priorityUrgent,
  high: ui.notifications.priorityHigh,
  medium: ui.notifications.priorityMedium,
  low: ui.notifications.priorityLow,
};

/** Скрываемые системные вкладки («Все» защищена — не предлагается). */
const HIDABLE_SYSTEM: Array<{ id: SystemTabId; label: string }> = [
  { id: 'urgent', label: ui.notifications.pillUrgent },
  { id: 'mentions', label: ui.notifications.pillMentions },
];

/**
 * Окно настройки вкладок ленты (#189, Slack-паттерн): создание/правка
 * кастомной вкладки-фильтра (название + оси kind и priority — независимы,
 * пустой выбор оси = «любой») и видимость системных вкладок. Окно с
 * пополняемыми данными: НЕ закрывается кликом снаружи, без крестика —
 * отмена только кнопкой или Esc (правило 30.09). Список типов —
 * фиксированной высоты (канон пикер-листов: окно не прыгает).
 */
export function TabsSettingsDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — создание; иначе правка существующей кастомной вкладки. */
  editing: CustomFeedTab | null;
}) {
  const { addTab, updateTab, hiddenSystem, hideSystemTab, showSystemTab } =
    useNotificationTabsStore();
  const [name, setName] = useState(editing?.name ?? '');
  const [kinds, setKinds] = useState<NotificationKind[]>(editing?.kinds ?? []);
  const [priorities, setPriorities] = useState<NotificationPriority[]>(editing?.priorities ?? []);

  const nameValid = isValidTabName(name);
  const changed =
    editing === null ||
    name.trim() !== editing.name ||
    JSON.stringify([...kinds].sort()) !== JSON.stringify([...editing.kinds].sort()) ||
    JSON.stringify([...priorities].sort()) !== JSON.stringify([...editing.priorities].sort());
  const canSubmit = nameValid && changed;

  function toggle<T extends string>(list: T[], value: T, set: (next: T[]) => void): void {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function submit(): void {
    if (!canSubmit) return;
    if (editing === null) {
      addTab(name, kinds, priorities);
    } else {
      updateTab(editing.id, { name, kinds, priorities });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {editing === null ? ui.notifications.tabsDialogCreate : ui.notifications.tabsDialogEdit}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notification-tab-name">{ui.notifications.tabsNameLabel}</Label>
            <Input
              id="notification-tab-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ui.notifications.tabsNamePlaceholder}
              maxLength={40}
              autoFocus
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.notifications.tabsPrioritiesLabel}
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={priorities.includes(p)}
                    onCheckedChange={() => toggle(priorities, p, setPriorities)}
                  />
                  {PRIORITY_LABEL[p]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.notifications.tabsKindsLabel}
            </span>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1" data-no-scrollbar>
              {KIND_OPTIONS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={kinds.includes(k)}
                    onCheckedChange={() => toggle(kinds, k, setKinds)}
                  />
                  {ui.notifications.kindTitles[k]}
                </label>
              ))}
            </div>
            {kinds.length === 0 && priorities.length === 0 && (
              <span className="text-xs text-muted-foreground">{ui.notifications.tabAnyFilter}</span>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.notifications.tabsSystemLabel}
            </span>
            {HIDABLE_SYSTEM.map((tab) => (
              <label key={tab.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={!hiddenSystem.includes(tab.id)}
                  onCheckedChange={() =>
                    hiddenSystem.includes(tab.id) ? showSystemTab(tab.id) : hideSystemTab(tab.id)
                  }
                />
                {tab.label}
              </label>
            ))}
            <span className="text-xs text-muted-foreground">{ui.notifications.tabsSystemHint}</span>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ui.notifications.tabsCancelButton}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {editing === null ? ui.notifications.tabsCreateButton : ui.notifications.tabsSaveButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
