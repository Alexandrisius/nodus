import { Camera, ChevronDown, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ConversationMemberRole, UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Switch } from '@nodus/ui/components/switch';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { useUsersList } from '../../../shared/api/users-list.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useCreateConversation } from '../api/chat-api.js';

/**
 * Создание группового чата/канала (#91, референс окна «Создание чата»
 * Bitrix24): название + аватарка-плейсхолдер, участники («человек или целый
 * отдел»), сворачиваемые «Настройки чата» (тип закрытый/открытый,
 * автоудаление, описание) и «Права доступа» (владелец, модераторы, матрица
 * минимальных ролей — контракт conversationPermissionsSchema). Аватарка и
 * модераторы — заглушки до сервера файлов и прав (toast-заготовка, как
 * «Опрос» линии A); создание живое на моках: беседа встаёт в список первой.
 */
export type CreateConversationKind = 'group' | 'project_channel';

type PermKey = 'addMembers' | 'removeMembers' | 'changeInfo' | 'post' | 'manageSettings';

/** Дефолты матрицы прав — зеркало серверных (контракт #91, модель Bitrix24). */
const DEFAULT_PERMISSIONS: Record<PermKey, ConversationMemberRole> = {
  addMembers: 'member',
  removeMembers: 'admin',
  changeInfo: 'admin',
  post: 'member',
  manageSettings: 'owner',
};

const PERM_LABELS: Record<PermKey, string> = {
  addMembers: ui.chat.permAddMembers,
  removeMembers: ui.chat.permRemoveMembers,
  changeInfo: ui.chat.permChangeInfo,
  post: ui.chat.permPost,
  manageSettings: ui.chat.permManageSettings,
};

function RoleSelect({
  permKey,
  value,
  onChange,
}: {
  permKey: PermKey;
  value: ConversationMemberRole;
  onChange: (role: ConversationMemberRole) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{PERM_LABELS[permKey]}</span>
      <Select value={value} onValueChange={(role) => onChange(role as ConversationMemberRole)}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">{ui.chat.roleMember}</SelectItem>
          <SelectItem value="admin">{ui.chat.roleAdmin}</SelectItem>
          <SelectItem value="owner">{ui.chat.roleOwner}</SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
}

/** Сворачиваемая секция окна создания (модель аккордеонов Bitrix24). */
function CreateSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <NodeLabel label={title} />
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={1.75}
        />
      </button>
      {open ? <div className="flex flex-col gap-4 px-3 pt-1 pb-4">{children}</div> : null}
    </section>
  );
}

function TypeRadio({
  checked,
  title,
  hint,
  onSelect,
}: {
  checked: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex items-start gap-2.5 text-left"
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-info' : 'border-input',
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-info" /> : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

export function ChatCreateDialog({
  kind,
  onCreated,
  onClose,
}: {
  kind: CreateConversationKind;
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const { data: users } = useUsersList();
  const create = useCreateConversation();

  const [title, setTitle] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'closed' | 'open'>('closed');
  const [autoDelete, setAutoDelete] = useState(false);
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [pickQuery, setPickQuery] = useState('');

  const candidates = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return (users?.items ?? []).filter(
      (u: UserListItem) =>
        u.id !== me?.id &&
        !memberIds.includes(u.id) &&
        (!q || u.displayName.toLowerCase().includes(q)),
    );
  }, [users, memberIds, pickQuery, me?.id]);

  function submit() {
    const name = title.trim();
    if (!name) return;
    create.mutate(
      {
        type: kind,
        title: name,
        description: description.trim() || undefined,
        visibility: kind === 'group' ? visibility : 'open',
        autoDeleteMessages: autoDelete || undefined,
        memberIds,
        permissions,
      },
      {
        onSuccess: (conversation) => onCreated(conversation.id),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {kind === 'group' ? ui.chat.createGroupChat : ui.chat.createChannel}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {/* Аватарка группы/канала — фундамент #91: плейсхолдер до сервера
                файлов (#57); право загрузки — changeInfo; до того беседа
                живёт с цветной заглушкой из инициалов (conversation-avatar). */}
            <button
              type="button"
              onClick={() => toast(ui.chat.avatarSoon)}
              aria-label={ui.chat.avatarSoon}
              title={ui.chat.avatarSoon}
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
            >
              <Camera className="size-5" strokeWidth={1.75} />
            </button>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ui.chat.chatTitlePlaceholder}
              aria-label={ui.chat.chatTitlePlaceholder}
              className="h-10 text-sm"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <NodeLabel label={ui.chat.participants} />
              <span className="text-xs text-muted-foreground">{ui.chat.participantsHint}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
              {me ? (
                <span className="flex items-center gap-1.5 rounded-md bg-accent px-1.5 py-1 text-xs font-medium">
                  <PersonAvatar name={me.displayName} avatarUrl={null} className="size-4" />
                  {me.displayName}
                </span>
              ) : null}
              {memberIds.map((id) => {
                const person = users?.items.find((u: UserListItem) => u.id === id);
                if (!person) return null;
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 rounded-md bg-accent px-1.5 py-1 text-xs font-medium"
                  >
                    <PersonAvatar
                      name={person.displayName}
                      avatarUrl={person.avatarUrl}
                      className="size-4"
                    />
                    {person.displayName}
                    <button
                      type="button"
                      onClick={() => setMemberIds(memberIds.filter((m) => m !== id))}
                      aria-label={ui.chat.removeParticipant}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" strokeWidth={2} />
                    </button>
                  </span>
                );
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-1.5 py-1 text-xs font-medium text-info hover:underline"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    {ui.chat.addParticipant}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-1">
                  <Input
                    value={pickQuery}
                    onChange={(e) => setPickQuery(e.target.value)}
                    placeholder={ui.chat.participantSearch}
                    aria-label={ui.chat.participantSearch}
                    className="h-8 mb-1 text-sm"
                  />
                  <div className="flex max-h-52 flex-col overflow-y-auto" data-no-scrollbar>
                    {candidates.map((person: UserListItem) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setMemberIds([...memberIds, person.id])}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <PersonAvatar
                          name={person.displayName}
                          avatarUrl={person.avatarUrl}
                          className="size-6"
                        />
                        <span className="truncate">{person.displayName}</span>
                      </button>
                    ))}
                    {candidates.length === 0 ? (
                      <span className="px-2 py-3 text-center text-xs text-muted-foreground">
                        {ui.chat.forwardEmpty}
                      </span>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <CreateSection title={ui.chat.chatSettingsSection}>
            <div
              role="radiogroup"
              aria-label={ui.chat.chatTypeLabel}
              className="flex flex-col gap-3"
            >
              <TypeRadio
                checked={visibility === 'closed'}
                title={ui.chat.chatTypeClosed}
                hint={ui.chat.chatTypeClosedHint}
                onSelect={() => setVisibility('closed')}
              />
              <TypeRadio
                checked={visibility === 'open'}
                title={ui.chat.chatTypeOpen}
                hint={ui.chat.chatTypeOpenHint}
                onSelect={() => setVisibility('open')}
              />
            </div>
            <label className="flex items-center gap-2.5">
              <Switch checked={autoDelete} onCheckedChange={setAutoDelete} />
              <span className="text-sm font-medium">{ui.chat.autoDelete}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {ui.chat.descriptionLabel}
              </span>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={ui.chat.descriptionPlaceholder}
                rows={3}
                className="resize-none text-sm"
              />
            </label>
          </CreateSection>

          <CreateSection title={ui.chat.permissionsSection}>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {ui.chat.moderatorsLabel}
              </span>
              <button
                type="button"
                onClick={() => toast(ui.chat.actionSoon)}
                className="w-fit px-1.5 py-1 text-xs font-medium text-info hover:underline"
              >
                + {ui.chat.addModerator}
              </button>
            </div>
            {(Object.keys(DEFAULT_PERMISSIONS) as PermKey[]).map((key) => (
              <RoleSelect
                key={key}
                permKey={key}
                value={permissions[key]}
                onChange={(role) => setPermissions({ ...permissions, [key]: role })}
              />
            ))}
          </CreateSection>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button variant="secondary" disabled={!title.trim() || create.isPending} onClick={submit}>
            {ui.chat.createSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
