import { FolderOpen, House, ListTodo, Mail, MessageSquare, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@nodus/ui/components/command';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';

import { useUsersList } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';

const actions = [
  { to: '/', label: ui.nav.home, icon: House },
  { to: '/tasks', label: ui.nav.tasks, icon: ListTodo },
  { to: '/letters', label: ui.nav.letters, icon: Mail },
  { to: '/projects', label: ui.nav.projects, icon: FolderOpen },
  { to: '/chat', label: ui.nav.chat, icon: MessageSquare },
  { to: '/employees', label: ui.nav.employees, icon: Users },
];

/** Ctrl+K: единый поиск по разделам и людям (вау №4, §10.7). */
export function CommandPalette() {
  const open = useShellStore((s) => s.commandOpen);
  const setOpen = useShellStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const { data } = useUsersList();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const people = (data?.items ?? []).filter((u) =>
    u.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function go(to: string) {
    setOpen(false);
    void navigate({ to });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">{ui.topbar.searchPlaceholder}</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={ui.topbar.searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{ui.common.empty}</CommandEmpty>
            {query.trim() === '' && (
              <CommandGroup>
                {actions.map((action) => (
                  <CommandItem key={action.to} value={action.to} onSelect={() => go(action.to)}>
                    <action.icon data-icon="inline-start" />
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {query.trim() !== '' && people.length > 0 && (
              <CommandGroup heading={ui.nav.employees}>
                {people.map((person) => (
                  <CommandItem key={person.id} value={person.id} onSelect={() => go('/employees')}>
                    <PersonAvatar name={person.displayName} className="size-6" />
                    {person.displayName}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {person.positionName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
