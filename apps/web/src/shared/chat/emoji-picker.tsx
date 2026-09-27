import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Панель эмодзи композера (#130, реф Telegram): открывается кнопкой Smile,
 * категории + поиск (EN имена + RU ключевые слова CLDR) + «Недавние»
 * (localStorage). Выбор — вставка юникода в позицию каретки (вставку делает
 * хост через onPick); панель НЕ закрывается — эмодзи ставят серией (канон
 * Telegram: пикер живёт, пока пользователь не уйдёт).
 *
 * Данные — 1906 эмодзи Unicode 16.0 (без тонов кожи) из
 * public/emoji/emoji-data.json (~60КБ gzip), грузятся fetch'ем при первом
 * открытии панели (бандл старта не платит). Глифы — шрифтом Noto Color
 * Emoji (self-host, #130): единый «гугловский» вид на любом устройстве.
 */

const RECENT_KEY = 'nodus-emoji-recent-v1';
const RECENT_MAX = 24;

export function recentEmojis(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string): void {
  const next = [emoji, ...recentEmojis().filter((x) => x !== emoji)].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export interface EmojiEntry {
  /** Юникод-глиф (вставляется в текст как есть). */
  e: string;
  /** Английское имя (unicode) — поиск. */
  n: string;
  /** Русские ключевые слова (CLDR tts + default) — поиск. */
  s?: string;
}

interface EmojiGroupJson {
  id: string;
  emojis: EmojiEntry[];
}

interface EmojiData {
  EMOJI_GROUPS: EmojiGroupJson[];
}

type Section = { id: string; title: string; emojis: EmojiEntry[] };

/** Названия категорий — из i18n (I15), данные их не несут. */
const GROUP_TITLES: Record<string, string> = {
  smileys: ui.chat.emojiGroupSmileys,
  people: ui.chat.emojiGroupPeople,
  nature: ui.chat.emojiGroupNature,
  food: ui.chat.emojiGroupFood,
  activity: ui.chat.emojiGroupActivity,
  travel: ui.chat.emojiGroupTravel,
  objects: ui.chat.emojiGroupObjects,
  symbols: ui.chat.emojiGroupSymbols,
  flags: ui.chat.emojiGroupFlags,
};
/** Данные — public/emoji/emoji-data.json (Unicode 16.0 + CLDR ru; генерация,
 *  вне линтера I5): 204КБ, gzip ~60КБ, грузится ПРИ ОТКРЫТИИ панели один раз. */
let dataCache: Promise<EmojiData> | null = null;
function loadEmojiData(): Promise<EmojiData> {
  dataCache ??= fetch('/emoji/emoji-data.json')
    .then((res) => {
      if (!res.ok) throw new Error('emoji data unavailable');
      return res.json() as Promise<{ groups: EmojiGroupJson[] }>;
    })
    .then((json) => ({ EMOJI_GROUPS: json.groups }));
  return dataCache;
}

export function EmojiPickerButton({
  onPick,
  children,
}: {
  onPick: (emoji: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<EmojiData | null>(null);
  const [recent, setRecent] = useState<string[]>(() => recentEmojis());
  useEffect(() => {
    if (!open || data) return;
    let live = true;
    void loadEmojiData().then((loaded) => {
      if (live) setData(loaded);
    });
    return () => {
      live = false;
    };
  }, [open, data]);

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      const found: EmojiEntry[] = [];
      for (const group of data.EMOJI_GROUPS) {
        for (const entry of group.emojis) {
          if (entry.n.includes(q) || entry.s?.includes(q)) found.push(entry);
        }
      }
      return [{ id: 'search', title: ui.chat.emojiSearchResults, emojis: found.slice(0, 120) }];
    }
    const sections = data.EMOJI_GROUPS.map((group) => ({
      id: group.id,
      title: GROUP_TITLES[group.id] ?? group.id,
      emojis: group.emojis,
    }));
    if (recent.length > 0) {
      const byEmoji = new Map(data.EMOJI_GROUPS.flatMap((g) => g.emojis).map((e) => [e.e, e]));
      const recentEntries = recent
        .map((e) => byEmoji.get(e))
        .filter((e): e is NonNullable<typeof e> => Boolean(e));
      if (recentEntries.length > 0) {
        sections.unshift({ id: 'recent', title: ui.chat.emojiRecent, emojis: recentEntries });
      }
    }
    return sections;
  }, [data, query, recent]);

  function pick(emoji: string) {
    pushRecentEmoji(emoji);
    setRecent(recentEmojis());
    onPick(emoji);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-88 p-0"
        // «Вечный курсор» (канон #71): попап не крадёт фокус композера.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui.chat.emojiSearch}
            className="h-8 text-sm"
            aria-label={ui.chat.emojiSearch}
          />
        </div>
        <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
          {data === null ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Search className="mr-2 size-4 animate-pulse" strokeWidth={1.75} />
              {ui.chat.emojiLoading}
            </div>
          ) : sections.length === 0 || sections.every((section) => section.emojis.length === 0) ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {ui.chat.emojiNothingFound}
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.id} className="mb-1">
                <h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  {section.title}
                </h3>
                <div className="grid grid-cols-8 gap-0.5">
                  {section.emojis.map((entry) => (
                    <button
                      key={entry.e}
                      type="button"
                      aria-label={entry.n}
                      title={entry.n}
                      onClick={() => pick(entry.e)}
                      className={cn(
                        'flex size-9 cursor-pointer items-center justify-center rounded-lg text-2xl transition-transform hover:scale-110 hover:bg-accent',
                      )}
                    >
                      {entry.e}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
