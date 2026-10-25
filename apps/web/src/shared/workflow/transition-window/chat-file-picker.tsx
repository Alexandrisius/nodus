import { FileText, ImageIcon } from 'lucide-react';
import { useState } from 'react';
import type { MessageAttachment, VaultItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { useConversationVault, vaultItems } from '../../chat/vault-api.js';

/**
 * «Выбрать из чата задачи» (#380): встроенная панель (не вложенный диалог),
 * файлы/изображения беседы задачи мультивыбором. Выбор плитки = выбор её
 * СООБЩЕНИЯ (все вложения сообщения подсвечиваются вместе) — в итог уходят
 * messageIds, канон #252 «файлы задачи — вложения её чата».
 */
export function ChatFilePicker({
  conversationId,
  selected,
  onToggle,
}: {
  conversationId: string;
  selected: readonly string[];
  onToggle: (messageId: string) => void;
}) {
  const [tab, setTab] = useState<'document' | 'image'>('document');
  const query = useConversationVault(conversationId, tab, null, true);
  const items = vaultItems(query).filter(
    (item): item is Extract<VaultItem, { attachment: MessageAttachment }> => 'attachment' in item,
  );
  const selectedSet = new Set(selected);

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" className="flex gap-1">
        {(
          [
            ['document', ui.tasks.window.filesTab],
            ['image', ui.tasks.window.imagesTab],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={tab === value ? 'secondary' : 'ghost'}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid h-56 grid-cols-2 content-start gap-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
        {items.length === 0 ? (
          <p className="col-span-2 px-2 py-4 text-center text-xs text-muted-foreground">
            {query.isLoading ? ui.common.search : ui.tasks.window.filesEmpty}
          </p>
        ) : (
          items.map((item) => {
            const active = selectedSet.has(item.messageId);
            const image = item.type === 'image';
            const thumb = item.attachment.thumbnailUrl ?? item.attachment.url;
            return (
              <button
                key={item.attachment.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(item.messageId)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent',
                )}
                title={item.attachment.name}
              >
                {image && thumb ? (
                  <img
                    src={thumb}
                    alt={item.attachment.name}
                    className="size-8 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                    {image ? (
                      <ImageIcon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    ) : (
                      <FileText className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    )}
                  </span>
                )}
                <span className="min-w-0 truncate text-xs">{item.attachment.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
