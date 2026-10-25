import { ui } from '@nodus/contracts';

import { ChatMessagePicker } from '../chat-message-picker.js';
import type { WindowDraft } from '../use-window-draft.js';

/** «Сообщения из чата как итог» (#380): флажки сообщений беседы задачи. */
export function ResultMessagesSection({
  conversationId,
  draft,
  toggleMessage,
  disabled,
}: {
  conversationId: string | null;
  draft: WindowDraft;
  toggleMessage: (messageId: string) => void;
  disabled: boolean;
}) {
  if (conversationId === null) {
    return disabled ? null : (
      <p className="text-xs text-muted-foreground">{ui.tasks.window.noConversation}</p>
    );
  }
  return (
    <ChatMessagePicker
      conversationId={conversationId}
      selected={draft.messages}
      onToggle={disabled ? () => {} : toggleMessage}
    />
  );
}
