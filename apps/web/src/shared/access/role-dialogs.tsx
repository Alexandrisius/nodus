import { useState } from 'react';
import type { Role } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { useCreateRole, useDeleteRole, useUpdateRole } from '../api/role-admin.js';
import { useRoles } from '../api/roles.js';

/** Окна пополняются данными — мимо-клик их не закрывает (правило 30.09). */
const DIALOG_PROPS = {
  className: 'sm:max-w-md',
  showCloseButton: false,
  onInteractOutside: (event: Event) => event.preventDefault(),
} as const;

/** Создание роли: название и описание. Копия существующей — в меню самой роли. */
export function CreateRoleDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateRole();
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    create.mutate({ name: trimmed, description });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...DIALOG_PROPS}>
        <DialogHeader>
          <DialogTitle>{ui.access.createTitle}</DialogTitle>
          <DialogDescription className="sr-only">{ui.access.createTitle}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-muted-foreground">{ui.access.createNameLabel}</span>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={ui.access.createNamePlaceholder}
              maxLength={128}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-muted-foreground">
              {ui.access.createDescriptionLabel}
            </span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={512}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.access.createCancel}
          </Button>
          <Button disabled={!trimmed} onClick={submit}>
            {ui.access.createSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenameRoleDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const [name, setName] = useState(role.name);
  const update = useUpdateRole();
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    if (trimmed !== role.name) update.mutate({ id: role.id, body: { name: trimmed } });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...DIALOG_PROPS}>
        <DialogHeader>
          <DialogTitle>{ui.access.renameRole}</DialogTitle>
          <DialogDescription className="sr-only">{role.name}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-muted-foreground">{ui.access.renameLabel}</span>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={128}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
          />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.access.createCancel}
          </Button>
          <Button disabled={!trimmed} onClick={submit}>
            {ui.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Подтверждение удаления: необратимое действие — через диалог, не из меню. */
export function DeleteRoleDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const remove = useDeleteRole();
  // Состав мог измениться после загрузки списка — считаем по свежему кэшу.
  const fresh = useRoles().data?.find((item) => item.id === role.id) ?? role;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{ui.access.deleteTitle(role.name)}</DialogTitle>
          <DialogDescription>
            {fresh.memberCount > 0 || fresh.departmentCount > 0
              ? ui.access.deleteBodyMembers(fresh.memberCount, fresh.departmentCount)
              : ui.access.deleteBody}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.access.createCancel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              remove.mutate(role.id);
              onClose();
            }}
          >
            {ui.access.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
