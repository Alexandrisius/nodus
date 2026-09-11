import { FileText, Link2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { useConversationMessages } from './api.js';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h4 className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <NodeLabel label={title} />
      </h4>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Состояние панели беседы: монтируется один раз при первом открытии и
 * остаётся (плавный translate, скролл не теряется) — тот же приём, что
 * у панели «О задаче».
 */
export function useChatSidePanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggle = useCallback(() => {
    setMounted(true);
    setOpen((v) => !v);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return { open, mounted, toggle, close };
}

/**
 * ЗАКОН (вердикт владельца 2026-09-11, раунд 3): где чат — там правая
 * выдвижная панель с вложениями и ссылками беседы. Применяется во всех
 * пейнах shared/chat (беседа, лента канала, тред); в карточке задачи её
 * роль играет панель «О задаче» (те же секции + история и избранное).
 *
 * Панель — оверлей ПОВЕРХ зоны ленты (absolute inset-y-0 right-0): чат в
 * карточке может быть узким, вталкивание не оставило бы места сообщениям;
 * композер и шапка треда НЕ перекрываются — писать можно с открытой
 * панелью (дух вердикта о доступности композера из панели «О задаче»).
 */
export function ChatSidePanel({
  conversationId,
  open,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data } = useConversationMessages(conversationId);
  const items = data?.items ?? [];
  const files = items.flatMap((m) => m.attachments);
  const links = items.flatMap((m) => m.text.match(/https?:\/\/\S+/g) ?? []);

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-10 flex w-72 flex-col gap-3 overflow-y-auto border-l border-border bg-card p-4 transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex shrink-0 items-center justify-between">
        <NodeLabel label={ui.chat.panelTitle} />
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-accent"
          onClick={onClose}
          aria-label={ui.common.close}
        >
          <X />
        </Button>
      </div>

      <Section icon={FileText} title={ui.chat.filesMedia}>
        {files.length > 0 ? (
          files.map((file) => (
            <span key={file.id} className="truncate font-mono text-[12px] text-info">
              {file.name}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
        )}
      </Section>

      <Section icon={Link2} title={ui.chat.links}>
        {links.length > 0 ? (
          links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-[12px] text-info hover:underline"
            >
              {link}
            </a>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
        )}
      </Section>
    </aside>
  );
}
