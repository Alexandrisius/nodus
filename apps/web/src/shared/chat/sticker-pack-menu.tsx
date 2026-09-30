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
 * чата. Само диалоги НЕ рендерит: создание/переименование/удаление —
 * «тяжёлые» окна, которые хост должен монтировать ВНЕ поповера панели
 * (клик мимо закрывает поповер и уносит потомков — репро 30.09); хост
 * получает колбэки и решает, где жить диалогам. Управление («для всех») —
 * владелец пака и админ для корпоративных; «для себя» — снять установленный.
 */

export type PackDialogRequest =
  | { kind: 'create' }
  | { kind: 'append'; pack: StickerPack }
  | { kind: 'rename'; pack: StickerPack }
  | { kind: 'delete'; pack: StickerPack };

export function StickerPackMenu({
  pack,
  onDialog,
}: {
  pack: StickerPack;
  /** Запрос тяжёлого окна: хост рендерит его ВНЕ поповеров. */
  onDialog: (request: PackDialogRequest) => void;
}) {
  const canManage = useCanManageStickerPacks();
  const manageable = pack.owned || (pack.scope === 'corporate' && canManage);

  return (
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
            <DropdownMenuItem onSelect={() => onDialog({ kind: 'append', pack })}>
              <Plus className="size-4" strokeWidth={1.75} />
              {ui.chat.stickerAddToPack}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDialog({ kind: 'rename', pack })}>
              {ui.chat.stickerRename}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDialog({ kind: 'delete', pack })}
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
              {ui.chat.stickerDeletePack}
            </DropdownMenuItem>
          </>
        ) : pack.installed && pack.scope === 'personal' ? (
          <UninstallItem packId={pack.id} />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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

/** Переименование пака: окно с вводом — мимо-клик НЕ закрывает (канон
 * #148/#149/#143), закрытие — кнопками/Esc. */
export function RenamePackDialog({ pack, onClose }: { pack: StickerPack; onClose: () => void }) {
  const rename = useRenameStickerPack();
  const [title, setTitle] = useState(pack.title);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(event) => event.preventDefault()}
        showCloseButton={false}
      >
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

/** Подтверждение удаления «для всех» (без ввода — мимо-клик допустим). */
export function DeletePackDialog({ pack, onClose }: { pack: StickerPack; onClose: () => void }) {
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
