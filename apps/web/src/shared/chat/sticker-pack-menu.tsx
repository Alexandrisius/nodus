import { Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { toast } from 'sonner';

import {
  useDeleteStickerPack,
  useCanManageStickerPacks,
  useRenameStickerPack,
  useUninstallStickerPack,
} from './sticker-api.js';

/**
 * Меню «⋯» пака стикеров (#143): единое для вкладки пикера и окна пака из
 * чата. Само диалоги НЕ рендерит: создание/переименование/удаление —
 * «тяжёлые» окна, которые хост должен монтировать ВНЕ поповера панели
 * (клик мимо закрывает поповер и уносит потомков — репро 30.09); хост
 * получает колбэки и решает, где жить диалогам. Управление («для всех») —
 * владелец пака и админ для корпоративных; «для себя» — снять установленный.
 * Команд нет → кнопки НЕт (пустое меню — мусор, ревизия владельца 30.09).
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
  // Пустое меню не рендерим вовсе (ревизия владельца 30.09: «зачем мне это
  // видеть» — кнопка без команд только путает).
  if (!manageable && !(pack.installed && pack.scope === 'personal')) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={ui.chat.stickerPackMenu}
          title={ui.chat.stickerPackMenu}
        >
          <Ellipsis className="size-4" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      {/* Ширина контента — по содержимому: дефолт берёт ширину триггера
          (иконка 28px) и ломает пункты в перенос (ревизия 30.09). */}
      <DropdownMenuContent align="end" className="w-max min-w-44">
        {manageable ? (
          <>
            <DropdownMenuItem onSelect={() => onDialog({ kind: 'append', pack })}>
              <Plus className="size-4" strokeWidth={1.75} />
              {ui.chat.stickerAddToPack}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDialog({ kind: 'rename', pack })}>
              <Pencil className="size-4" strokeWidth={1.75} />
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
        ) : (
          <UninstallItem packId={pack.id} />
        )}
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
        <DialogFooter className="sm:items-center">
          <Button type="button" variant="ghost" size="default" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            type="button"
            size="default"
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

/** Подтверждение удаления «для всех» (без ввода — мимо-клик допустим). Ошибка
 *  сервера не оставляет окно висеть: тост + закрытие (ревизия 30.09 —
 *  «невозможно применить и закрыть» недопустимо). */
export function DeletePackDialog({ pack, onClose }: { pack: StickerPack; onClose: () => void }) {
  const remove = useDeleteStickerPack();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.chat.stickerDeletePack}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{ui.chat.stickerDeletePackHint}</p>
        <DialogFooter className="sm:items-center">
          <Button type="button" variant="ghost" size="default" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="default"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(pack.id, {
                onSuccess: onClose,
                onError: () => {
                  toast.error(ui.common.sendError);
                  onClose();
                },
              })
            }
          >
            {ui.chat.stickerDeletePack}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
