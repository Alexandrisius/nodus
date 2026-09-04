import { FolderOpen, House, ListTodo, Mail, MessageSquare, Sparkles, Users } from 'lucide-react';
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

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useLettersList } from '../../features/correspondence/api/letters-api.js';
import { useUsersList } from '../../features/directory/api/directory-api.js';
import { useProjectsList } from '../../features/projects/api/projects-api.js';
import { useTasksList } from '../../features/tasks/api/tasks-api.js';
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

/** Ctrl+K: умный поиск по всем сущностям портала (вау №4, §10.7). */
export function CommandPalette() {
  const open = useShellStore((s) => s.commandOpen);
  const setOpen = useShellStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const { data: users } = useUsersList();
  const { data: tasks } = useTasksList();
  const { data: projects } = useProjectsList();
  const { data: chats } = useConversations();
  const { data: incoming } = useLettersList('incoming');
  const { data: unregistered } = useLettersList('unregistered');
  const { data: outgoing } = useLettersList('outgoing');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const stems = q
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));
  const has = (text: string) => {
    const t = text.toLowerCase();
    return t.includes(q) || (stems.length > 0 && stems.every((s) => t.includes(s)));
  };
  const letters = [
    ...(unregistered?.items ?? []),
    ...(incoming?.items ?? []),
    ...(outgoing?.items ?? []),
  ];

  function go(to: string, params?: Record<string, string>) {
    setOpen(false);
    void navigate({ to, params } as never);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="paper-surface overflow-hidden p-0">
        <DialogTitle className="sr-only">{ui.topbar.smartSearch}</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            className="pr-8"
            placeholder={ui.topbar.smartSearchHint}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{ui.common.empty}</CommandEmpty>
            {q === '' && (
              <CommandGroup heading={ui.topbar.smartSearch}>
                {actions.map((action) => (
                  <CommandItem key={action.to} value={action.to} onSelect={() => go(action.to)}>
                    <action.icon data-icon="inline-start" />
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {q !== '' && (
              <>
                {(tasks?.items ?? []).filter((t) => has(t.title)).length > 0 && (
                  <CommandGroup heading={ui.nav.tasks}>
                    {(tasks?.items ?? [])
                      .filter((t) => has(t.title))
                      .map((task) => (
                        <CommandItem
                          key={task.id}
                          value={task.id}
                          onSelect={() => go('/tasks/$taskId', { taskId: task.id })}
                        >
                          <ListTodo data-icon="inline-start" />
                          {task.title}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
                {letters.filter((l) => has(l.subject) || has(l.correspondent)).length > 0 && (
                  <CommandGroup heading={ui.nav.letters}>
                    {letters
                      .filter((l) => has(l.subject) || has(l.correspondent))
                      .map((letter) => (
                        <CommandItem
                          key={letter.id}
                          value={letter.id}
                          onSelect={() => go('/letters/$letterId', { letterId: letter.id })}
                        >
                          <Mail data-icon="inline-start" />
                          {letter.subject}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
                {(projects?.items ?? []).filter((p) => has(p.name) || has(p.code)).length > 0 && (
                  <CommandGroup heading={ui.nav.projects}>
                    {(projects?.items ?? [])
                      .filter((p) => has(p.name) || has(p.code))
                      .map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.id}
                          onSelect={() => go('/projects/$projectId', { projectId: project.id })}
                        >
                          <FolderOpen data-icon="inline-start" />
                          {project.name}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
                {(chats?.items ?? []).filter(
                  (c) => has(c.title ?? '') || has(c.membersPreview[0]?.displayName ?? ''),
                ).length > 0 && (
                  <CommandGroup heading={ui.nav.chat}>
                    {(chats?.items ?? [])
                      .filter(
                        (c) => has(c.title ?? '') || has(c.membersPreview[0]?.displayName ?? ''),
                      )
                      .map((chat) => (
                        <CommandItem
                          key={chat.id}
                          value={chat.id}
                          onSelect={() => go('/chat/$conversationId', { conversationId: chat.id })}
                        >
                          <MessageSquare data-icon="inline-start" />
                          {chat.title ?? chat.membersPreview[0]?.displayName}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
                {(users?.items ?? []).filter((u) => has(u.displayName)).length > 0 && (
                  <CommandGroup heading={ui.nav.employees}>
                    {(users?.items ?? [])
                      .filter((u) => has(u.displayName))
                      .map((person) => (
                        <CommandItem
                          key={person.id}
                          value={person.id}
                          onSelect={() => go('/employees')}
                        >
                          <PersonAvatar name={person.displayName} className="size-6" />
                          {person.displayName}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {person.positionName}
                          </span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
        <p className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          {ui.topbar.smartSearchHint}
        </p>
      </DialogContent>
    </Dialog>
  );
}
