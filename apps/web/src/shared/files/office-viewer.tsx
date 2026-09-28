import { useEffect, useId, useRef, useState } from 'react';
import type { Config, DocEditor } from '@onlyoffice/doceditor-types';
import { ui, type OfficeSession } from '@nodus/contracts';

import { Spinner } from '@nodus/ui/components/spinner';

declare global {
  interface Window {
    /** api.js экспортирует ОБЪЕКТ с конструктором: new DocsAPI.DocEditor(...). */
    DocsAPI?: { DocEditor: new (id: string, config: Config) => DocEditor };
  }
}

/** Единственная загрузка api.js на приложение (тот же origin — DS проксируется
 *  корневыми путями: nginx в проде, vite-прокси в dev/песочнице, #138). */
let docsApiPromise: Promise<void> | null = null;

export function loadDocsApi(): Promise<void> {
  if (typeof window !== 'undefined' && window.DocsAPI) return Promise.resolve();
  if (docsApiPromise) return docsApiPromise;
  docsApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/web-apps/apps/api/documents/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Ретрай следующей попытки после неудачи (DS перезапускают).
      docsApiPromise = null;
      reject(new Error('DocsAPI failed to load'));
    };
    document.head.appendChild(script);
  });
  return docsApiPromise;
}

/**
 * Хост редактора ONLYOFFICE (#138): сессия собрана и подписана сервером —
 * document/editorConfig передаются ДОСЛОВНО (JWT проверяет целостность),
 * клиент добавляет только отображение (type/width/height) и события.
 * onOutdatedVersion — документ пересохранён другим пользователем: наверх
 * (пересоздание сессии с новой версией ключа).
 */
export function OfficeViewer({
  session,
  onOutdated,
  onEngineError,
}: {
  session: OfficeSession;
  onOutdated: () => void;
  onEngineError: () => void;
}) {
  const holderId = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const editorRef = useRef<DocEditor | null>(null);
  const [ready, setReady] = useState(false);
  const handlers = useRef({ onOutdated, onEngineError });
  handlers.current = { onOutdated, onEngineError };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadDocsApi()
      .then(() => {
        if (cancelled || !window.DocsAPI?.DocEditor) throw new Error('DocsAPI missing');
        // document/editorConfig идут с сервера дословно (JWT целостности);
        // каст — только типы: контракты держат строки, DocEditor-типы — union.
        const config: Config = {
          type: 'desktop',
          width: '100%',
          height: '100%',
          document: session.document as unknown as Config['document'],
          documentType: session.documentType,
          editorConfig: session.editorConfig as unknown as Config['editorConfig'],
          token: session.token,
          events: {
            onDocumentReady: () => setReady(true),
            onError: (event) => {
              console.error(
                '[office-viewer] onError',
                JSON.stringify(event?.data ?? event).slice(0, 300),
              );
              handlers.current.onEngineError();
            },
            onOutdatedVersion: () => handlers.current.onOutdated(),
          },
        };
        editorRef.current = new window.DocsAPI.DocEditor(holderId, config);
      })
      .catch((error) => {
        console.error('[office-viewer] init failed holder=' + holderId, error);
        if (!cancelled) handlers.current.onEngineError();
      });
    return () => {
      cancelled = true;
      // destroyEditor гасит iframe и каналы ко-эдитинга (утечки WS иначе).
      editorRef.current?.destroyEditor();
      editorRef.current = null;
    };
    // Сессия меняется только новой версией/режимом — пересоздаём редактор.
  }, [session, holderId]);

  return (
    <div className="relative size-full">
      <div id={holderId} className="size-full" />
      {!ready ? (
        <div className="absolute inset-0 grid place-items-center bg-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {ui.files.officePreparing}
          </div>
        </div>
      ) : null}
    </div>
  );
}
