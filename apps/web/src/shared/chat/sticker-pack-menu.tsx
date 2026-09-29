import { Ellipsis, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Input } from '@nodus/ui/components/input';

import {
  useDeleteStickerPack,
  useCanManageStickerPacks,
  useRenameStickerPack,
  useUninstallStickerPack,
} from './sticker-api.js';

/**
 * Меню «⋯» пака стикеров (#143): единое для вкладки пикера и поповера из
 * чата. Управление («для всех»: пополнить/переименовать/удалить) — владелец
 * пака и админ для корпоративных; «для себя» — снять установленный чужой.
 * Переименование и удаление — маленькие диалоги (ввод/подтверждение).
 */

export function StickerPackMenu({
  pack,
  onAppend,
}: {
  pack: StickerPack;
  /** «Добавить стикеры»: хост открывает диалог загрузки в этот пак. */
  onAppend: (pack: StickerPack) => void;
}) {
  const canManage = useCanManageStickerPacks();
  const manageable = pack.owned || (pack.scope === 'corporate' && canManage);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={ui.chat.stickerPackMenu}
            title={ui.chat.stickerPackMenu}
          >
            <Ellipsis className="size-4" strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom">
          {manageable ? (
            <>
              <DropdownMenuItem onSelect={() => onAppend(pack)}>
                <Plus className="size-4" strokeWidth={1.75} />
                {ui.chat.stickerAddToPack}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('rename')}>
                {ui.chat.stickerRename}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                <Trash2 className="size-4" strokeWidth={1.75} />
                {ui.chat.stickerDeletePack}
              </DropdownMenuItem>
            </>
          ) : pack.installed && pack.scope === 'personal' ? (
            <UninstallItem packId={pack.id} />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'rename' ? <RenameDialog pack={pack} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? <DeleteDialog pack={pack} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function UninstallItem({ packId }: { packId: string }) {
  const uninstall = useUninstallStickerPack();
  return (
    <DropdownMenuItem onSelect={() => uninstall.mutate(packId)}>
      {ui.chat.stickerDeleteForMe}
    </DropdownMenuItem>
  );
}

function RenameDialog({ pack, onClose }: { pack: StickerPack; onClose: () => void }) {
  const rename = useRenameStickerPack();
  const [title, setTitle] = useState(pack.title);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.chat.stickerRename}</DialogTitle>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={ui.chat.stickerPackTitlePlaceholder}
          maxLength={64}
          aria-label={ui.chat.stickerPackTitle}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={title.trim().length === 0 || rename.isPending}
            onClick={() =>
              rename.mutate(
                { packId: pack.id, body: { title: title.trim() } },
                { onSuccess: onClose },
              )
            }
          >
            {ui.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ pack, onClose }: { pack: StickerPack; onClose: () => void }) {
  const remove = useDeleteStickerPack();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.chat.stickerDeletePack}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{ui.chat.stickerDeletePackHint}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(pack.id, { onSuccess: onClose })}
          >
            {ui.chat.stickerDeletePack}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
