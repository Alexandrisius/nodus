import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
// Воркер как ассет vite: бандлер отдаёт файл и отдаёт URL (Context7 pdfjs-dist
// integration guide — workerSrc обязателен до первого getDocument).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Minus, Plus } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import { Spinner } from '@nodus/ui/components/spinner';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Масштаб рендера страницы (canvas-пикселей на CSS-пиксель; ×2 — чётко на
 *  ретине без заплаток pdfjs-viewer). */
const DEVICE_SCALE = 2;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Просмотр PDF (pdf.js, #138): лента страниц непрерывным скроллом, зум
 * шагами, номер страницы — по прокрутке. Страницы рендерятся лениво
 * (IntersectionObserver): бокс резервируется габаритами сразу — скролл
 * не прыгает, документ не рендерится целиком (100+ страниц не страшны).
 */
export function PdfViewer({ url, fileName }: { url: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url });
    task.promise
      .then((loaded) => {
        if (!cancelled) setDoc(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  const zoomIn = useCallback(() => {
    setZoom((z) => ZOOM_STEPS.find((step) => step > z + 0.01) ?? z);
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => [...ZOOM_STEPS].reverse().find((step) => step < z - 0.01) ?? z);
  }, []);

  // Номер страницы по верхней видимой странице.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !doc) return;
    const pages = [...container.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    const onScroll = () => {
      const top = container.scrollTop + 80;
      const visible = pages.find((page) => page.offsetTop + page.offsetHeight > top);
      const index = visible ? Number(visible.dataset.pdfPage) : pages.length;
      setPageNumber(Math.max(1, index || 1));
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [doc]);

  const status = useMemo(() => {
    if (failed) return ui.files.pdfOpenError;
    if (doc) return `${pageNumber} ${ui.files.pdfPageOf} ${doc.numPages}`;
    return ui.files.pdfLoading;
  }, [failed, doc, pageNumber]);

  return (
    <div className="flex size-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-4 text-[13px] text-muted-foreground">
        <span className="truncate" title={fileName}>
          {status}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={zoomOut} aria-label="Уменьшить">
            <Minus />
          </Button>
          <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" onClick={zoomIn} aria-label="Увеличить">
            <Plus />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 px-4 py-4">
        {failed ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{ui.files.pdfOpenError}</p>
        ) : !doc ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-5" />
          </div>
        ) : (
          <div className="mx-auto flex w-fit flex-col gap-4">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} pageNumber={i + 1} zoom={zoom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Страница с ленивым рендером: бокс резервируется пропорцией сразу. */
function PdfPage({
  doc,
  pageNumber,
  zoom,
}: {
  doc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(pageNumber <= 3);
  const [aspect, setAspect] = useState(1 / 1.414);

  useEffect(() => {
    const el = canvasRef.current?.closest('[data-pdf-page]') ?? canvasRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | null = null;
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.width / base.height);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cssWidth = 820 * zoom;
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * DEVICE_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = 'auto';
        // v6-контракт рендера: передаём сам canvas (canvasContext — deprecated).
        renderTask = page.render({ canvas, viewport });
        return renderTask.promise;
      })
      .catch(() => {
        /* страница не отрендерилась — пустой бокс остаётся */
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, zoom, visible]);

  return (
    <div
      data-pdf-page={pageNumber}
      className="overflow-hidden rounded-[8px] border bg-card shadow-none"
      style={{ aspectRatio: `${aspect}` }}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
