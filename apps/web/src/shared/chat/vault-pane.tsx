import { Download, FileText, Image as ImageIcon, Link2, MessagesSquare } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ui, type MessageAttachment } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useInfiniteSentinel } from '../views/use-infinite-sentinel.js';
import { FileTypeIcon } from '../files/file-type-icon.js';
import { useViewerStore } from '../files/viewer-store.js';
import { formatBytes, formatDateTimeShort } from '../lib/format.js';
import { ImageLightbox } from './image-lightbox.js';
import { useJumpStore } from './jump-store.js';
import { useConversationVault, vaultItems } from './vault-api.js';

/**
 * Витрина беседы (#211, Ф1–Ф2): правая панель «О чате» на СЕРВЕРНЫХ списках
 * — вложения и ссылки видны за пределами загруженного окна ленты. Сводка
 * строк-счётчиков (реф Telegram-профиля) над секциями (реф Битрикс24 «О
 * чате»): клик по строке скроллит к секции, пустой тип приглушён. Клик:
 * изображение → лайтбокс (листание страницы сетки), документ → просмотрщик
 * (канон ленты); «скачать» и «показать в чате» (jump-store #171) — у строк.
 */
export function VaultPane({
  conversationId,
  threadRootId,
  scrollRef,
}: {
  conversationId: string;
  /** Скоуп «Этот тред» (null — вся беседа). */
  threadRootId: string | null;
  /** Скролл-контейнер колонки (сентинелы догрузки секций). */
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const media = useConversationVault(conversationId, 'media', threadRootId);
  const documents = useConversationVault(conversationId, 'document', threadRootId);
  const links = useConversationVault(conversationId, 'link', threadRootId);
  const counts = links.data?.pages[0]?.counts ??
    documents.data?.pages[0]?.counts ??
    media.data?.pages[0]?.counts ?? { media: 0, document: 0, link: 0 };

  const mediaRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const mediaItems = vaultItems(media);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const mediaAttachments = mediaItems.flatMap((item) =>
    item.type === 'media' || item.type === 'document' ? [item.attachment] : [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Сводка-счётчики: строки-кнопки по типам (реф Telegram), клик —
          скролл к секции; пустой тип приглушён и некликабелен. */}
      <nav className="flex shrink-0 flex-col gap-0.5" aria-label={ui.chat.panelTitle}>
        {(
          [
            ['media', ui.chat.vaultMedia, counts.media, mediaRef, ImageIcon],
            ['document', ui.chat.vaultDocuments, counts.document, documentsRef, FileText],
            ['link', ui.chat.vaultLinks, counts.link, linksRef, Link2],
          ] as const
        ).map(([key, label, count, ref, Icon]) => (
          <button
            key={key}
            type="button"
            disabled={count === 0}
            onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
              count > 0 ? 'hover:bg-accent' : 'opacity-45',
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="flex-1 truncate text-sm">{label}</span>
            <span className="font-mono text-label-sm tabular-nums text-muted-foreground">
              {count}
            </span>
          </button>
        ))}
      </nav>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-5">
        {/* Медиа: сетка превью 3 колонки (реф Битрикс24), имя под плиткой. */}
        <VaultSection
          sectionRef={mediaRef}
          icon={ImageIcon}
          title={ui.chat.vaultMedia}
          empty={ui.chat.vaultMediaEmpty}
          query={media}
          scrollRef={scrollRef}
        >
          {mediaItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {mediaItems.map((item, index) =>
                item.type === 'media' || item.type === 'document' ? (
                  <MediaTile
                    key={item.attachment.id}
                    name={item.attachment.name}
                    src={item.attachment.thumbnailUrl ?? item.attachment.url ?? undefined}
                    onOpen={() => {
                      if (item.attachment.previewKind === 'image') {
                        setLightbox(index);
                      } else {
                        useViewerStore.getState().open(toViewerTarget(item.attachment));
                      }
                    }}
                  />
                ) : null,
              )}
            </div>
          ) : null}
        </VaultSection>

        {/* Документы: строки — иконка типа, имя, размер + дата + автор. */}
        <VaultSection
          sectionRef={documentsRef}
          icon={FileText}
          title={ui.chat.vaultDocuments}
          empty={ui.chat.vaultDocumentsEmpty}
          query={documents}
          scrollRef={scrollRef}
        >
          {vaultItems(documents).map((item) =>
            item.type === 'document' ? (
              <VaultRow
                key={item.attachment.id}
                icon={<FileTypeIcon mime={item.attachment.mime} className="size-4" />}
                title={item.attachment.name}
                meta={`${formatBytes(item.attachment.size)} · ${formatDateTimeShort(item.createdAt)} · ${item.author.displayName}`}
                downloadUrl={item.attachment.url ?? undefined}
                conversationId={conversationId}
                messageId={item.messageId}
                threadRootId={item.threadRootId}
                onOpen={() => useViewerStore.getState().open(toViewerTarget(item.attachment))}
              />
            ) : null,
          )}
        </VaultSection>

        {/* Ссылки: домен + человекочитаемый путь, автор и дата; клик —
            внешнее открытие, «показать в чате» — прыжок к источнику. */}
        <VaultSection
          sectionRef={linksRef}
          icon={Link2}
          title={ui.chat.vaultLinks}
          empty={ui.chat.vaultLinksEmpty}
          query={links}
          scrollRef={scrollRef}
        >
          {vaultItems(links).map((item) =>
            item.type === 'link' ? (
              <VaultRow
                key={`${item.messageId}:${item.url}`}
                icon={<Link2 className="size-4 text-muted-foreground" strokeWidth={1.75} />}
                title={linkLabel(item.url)}
                meta={`${item.author.displayName} · ${formatDateTimeShort(item.createdAt)}`}
                href={item.url}
                conversationId={conversationId}
                messageId={item.messageId}
                threadRootId={item.threadRootId}
              />
            ) : null,
          )}
        </VaultSection>
      </div>

      {lightbox !== null ? (
        <ImageLightbox
          images={mediaAttachments}
          index={Math.min(lightbox, mediaAttachments.length - 1)}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

/** Плитка медиа-сетки: квадратное превью (aspect-square, object-cover; фон
 *  bg-muted — скелетон до загрузки) + подпись-имя под плиткой (реф Битрикс). */
function MediaTile({
  name,
  src,
  onOpen,
}: {
  name: string;
  src: string | undefined;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={name}
      title={name}
      className="group flex flex-col gap-1 text-left"
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-md bg-muted/60">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        ) : null}
      </span>
      <span className="truncate text-xs text-muted-foreground">{name}</span>
    </button>
  );
}

/**
 * Строка документа/ссылки: основное действие строкой (просмотрщик/внешнее
 * открытие), справа при ховере — «скачать» (документы) и «показать в чате».
 */
function VaultRow({
  icon,
  title,
  meta,
  conversationId,
  messageId,
  threadRootId,
  onOpen,
  href,
  downloadUrl,
}: {
  icon: ReactNode;
  title: string;
  meta: string;
  conversationId: string;
  messageId: string;
  threadRootId: string | null;
  /** Клик по строке: внешняя ссылка (ссылки) или просмотрщик (документы). */
  onOpen?: () => void;
  href?: string;
  downloadUrl?: string;
}) {
  const jump = () => useJumpStore.getState().request(conversationId, messageId, threadRootId);
  const actions = (
    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download
          aria-label={ui.chat.download}
          title={ui.chat.download}
          onClick={(event) => event.stopPropagation()}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Download className="size-3.5" strokeWidth={1.75} />
        </a>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (href) event.preventDefault();
          jump();
        }}
        aria-label={ui.chat.showInChat}
        title={ui.chat.showInChat}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MessagesSquare className="size-3.5" strokeWidth={1.75} />
      </button>
    </span>
  );
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {actions}
    </>
  );
  const className =
    'group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={className}>
      {body}
    </button>
  );
}

/** Секция витрины: заголовок + контент + сентинел догрузки (страницы по 60,
 *  скролл общий — колонка панели; длинные списки не блокируют UI). */
function VaultSection({
  sectionRef,
  icon: Icon,
  title,
  empty,
  query,
  scrollRef,
  children,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
  icon: typeof FileText;
  title: string;
  empty: string;
  query: ReturnType<typeof useConversationVault>;
  scrollRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const items = vaultItems(query);
  useInfiniteSentinel(scrollRef, sentinelRef, {
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    onLoadMore: () => void query.fetchNextPage(),
  });
  return (
    <section ref={sectionRef} className="scroll-mt-2">
      <h4 className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {items.length > 0 ? (
          <span className="ml-auto font-mono text-label-sm tabular-nums text-muted-foreground">
            {items.length}
          </span>
        ) : null}
      </h4>
      <div className="mt-2 flex flex-col gap-1">
        {children}
        {items.length === 0 && !query.isLoading ? (
          <span className="px-1 py-1.5 text-sm text-muted-foreground">{empty}</span>
        ) : null}
        <div ref={sentinelRef} aria-hidden className="h-px" />
      </div>
    </section>
  );
}

/** Человекочитаемая подпись ссылки: домен + усечённый путь (не голый URL). */
export function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const label = parsed.host + parsed.pathname.replace(/\/$/, '');
    return label.length > 34 ? `${label.slice(0, 33)}…` : label;
  } catch {
    return url.length > 34 ? `${url.slice(0, 33)}…` : url;
  }
}

function toViewerTarget(attachment: MessageAttachment) {
  return {
    fileId: attachment.fileId,
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    url: attachment.url,
    previewKind: attachment.previewKind,
    pdfUrl: attachment.pdfUrl,
  };
}
