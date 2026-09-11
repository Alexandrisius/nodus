import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';

/**
 * Приглашение сотрудника (модель Битрикс24, кнопка «Пригласить» в шапке
 * журнала): рабочая почта → POST /directory/invitations. Заготовка под
 * бэкенд директории (полный поток: роль, подразделение, письмо-инвайт).
 */
export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    const value = email.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      await api('/directory/invitations', { method: 'POST', body: { email: value } });
      toast.success(ui.employees.inviteDone);
      setEmail('');
      onOpenChange(false);
    } catch {
      toast.error(ui.common.sendError);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-96">
        <DialogTitle>{ui.employees.inviteTitle}</DialogTitle>
        <form
          className="flex flex-col gap-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ui.employees.inviteEmailPlaceholder}
            aria-label={ui.employees.inviteTitle}
            className="h-9 text-sm"
          />
          <Button type="submit" disabled={!email.trim() || pending}>
            {ui.employees.inviteSubmit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
