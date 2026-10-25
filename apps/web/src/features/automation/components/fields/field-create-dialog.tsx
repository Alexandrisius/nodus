import { useState } from 'react';
import type {
  CreateCustomFieldBody,
  CustomFieldScope,
  CustomFieldSettings,
  CustomFieldType,
} from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { ApiError } from '../../../../shared/api-client.js';
import { useDictionaries } from '../../../../shared/dictionaries/queries.js';
import { useCreateCustomField } from '../../api/custom-fields-api.js';
import { useCreateDictionary } from '../../api/dictionaries-api.js';
import type { FieldFamily } from '../../lib/field-type-families.js';
import { baseTypeOf } from '../../lib/field-type-families.js';
import { FIELD_SCOPES } from './field-list.js';
import { FieldSettings } from './field-settings.js';
import { FieldTypePicker } from './field-type-picker.js';

/**
 * «Новое поле» (#431): область, плитки 13 семейств, название, для списка —
 * новые варианты строками или существующий справочник, для числа — точность,
 * для денег — валюта. Создание пессимистичное (справочник → поле, id нужен
 * редактору); окно не закрывается кликом мимо (канон: заполненное не теряем).
 */
export function FieldCreateDialog({
  defaultScope,
  onClose,
  onCreated,
}: {
  defaultScope?: CustomFieldScope;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [scope, setScope] = useState<CustomFieldScope>(defaultScope ?? 'task');
  const [family, setFamily] = useState<FieldFamily | null>(null);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<CustomFieldSettings>({});
  const [listMode, setListMode] = useState<'new' | 'existing'>('new');
  const [optionsText, setOptionsText] = useState('');
  const [dictionaryId, setDictionaryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createField = useCreateCustomField();
  const createDictionary = useCreateDictionary();
  const { data: dictionaries = [] } = useDictionaries();
  const availableDictionaries = dictionaries.filter((dictionary) => !dictionary.isSystem);
  const pending = createField.isPending || createDictionary.isPending;
  const isList = family === 'list';
  const options = optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const valid =
    name.trim().length > 0 &&
    family !== null &&
    (!isList || (listMode === 'new' ? options.length > 0 : dictionaryId !== null));

  async function submit() {
    if (!valid || !family || pending) return;
    setError(null);
    try {
      let listId = dictionaryId;
      if (isList && listMode === 'new') {
        const dictionary = await createDictionary.mutateAsync({
          name: name.trim(),
          items: options,
        });
        listId = dictionary.id;
      }
      const body: CreateCustomFieldBody = {
        scope,
        type: baseTypeOf(family) as CustomFieldType,
        name: name.trim(),
        reportIndexed: false,
        settings:
          isList && listId
            ? { dictionaryId: listId }
            : family === 'number' || family === 'money'
              ? settings
              : {},
      };
      const definition = await createField.mutateAsync(body);
      onCreated(definition.id);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code in errorMessages) {
        setError(errorMessages[caught.code as ErrorCode]);
      } else {
        setError(ui.common.saveError);
      }
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex h-[min(44rem,90vh)] max-w-[560px] flex-col gap-4 overflow-hidden p-5 sm:max-w-[560px]"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{ui.customFields.create.title}</DialogTitle>
          <DialogDescription>{ui.customFields.create.hint}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="flex gap-2">
            <label className="flex w-40 shrink-0 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{ui.customFields.create.scope}</span>
              <Select value={scope} onValueChange={(value) => setScope(value as CustomFieldScope)}>
                <SelectTrigger aria-label={ui.customFields.create.scope}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_SCOPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ui.customFields.scopes[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{ui.customFields.create.name}</span>
              <Input
                autoFocus
                value={name}
                maxLength={60}
                placeholder={ui.customFields.create.namePlaceholder}
                aria-label={ui.customFields.create.name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm"
              />
            </label>
          </div>
          {scope !== 'task' ? (
            <p className="text-xs text-muted-foreground">
              {ui.customFields.scopePending[scope as 'letter' | 'project' | 'counterparty']}
            </p>
          ) : null}

          <FieldTypePicker value={family} onChange={setFamily} disabled={pending} />

          {family === 'number' || family === 'money' ? (
            <FieldSettings
              family={family}
              settings={settings}
              disabled={pending}
              onChange={setSettings}
            />
          ) : null}

          {isList ? (
            <div className="flex flex-col gap-2">
              <div
                role="radiogroup"
                aria-label={ui.customFields.create.optionsTitle}
                className="flex gap-1.5"
              >
                {(
                  [
                    ['new', ui.customFields.create.dictionaryNew],
                    ['existing', ui.customFields.create.dictionaryPick],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={listMode === value}
                    onClick={() => setListMode(value)}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                      listMode === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/60',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {listMode === 'new' ? (
                <Textarea
                  value={optionsText}
                  maxLength={4000}
                  placeholder={ui.customFields.create.optionsLinesPlaceholder}
                  aria-label={ui.customFields.create.optionsLines}
                  onChange={(e) => setOptionsText(e.target.value)}
                  className="min-h-24 text-sm [field-sizing:content]"
                />
              ) : (
                <Select
                  value={dictionaryId ?? undefined}
                  onValueChange={(value) => setDictionaryId(value)}
                >
                  <SelectTrigger aria-label={ui.customFields.create.dictionaryPick}>
                    <SelectValue placeholder={ui.customFields.create.dictionaryPick} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDictionaries.map((dictionary) => (
                      <SelectItem key={dictionary.id} value={dictionary.id}>
                        {dictionary.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {ui.common.cancel}
          </Button>
          <Button disabled={!valid || pending} onClick={() => void submit()}>
            {pending ? ui.customFields.create.submitting : ui.customFields.create.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
