import '@xyflow/react/dist/base.css';
import './flow-theme.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type AriaLabelConfig,
  type Dimensions,
  type EdgeTypes,
  type IsValidConnection,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnDelete,
  type OnNodeDrag,
  type OnNodesChange,
  type OnReconnect,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { AnyNode } from './any-node.js';
import { FlowMarkers } from './flow-markers.js';
import { StartNode } from './start-node.js';
import { StatusNode } from './status-node.js';
import { TransitionEdge } from './transition-edge.js';

/**
 * Единый движок холста схем (ADR-0022): обёртка React Flow с нашими
 * настройками — потребители (редактор маршрутов, «Схема маршрута», будущая
 * схема проектов) кормят готовые nodes/edges и обрабатывают события.
 * Масштаб, «вписать» и доп. кнопки потребителя (отмена/повтор) — слева
 * внизу, атрибуция — справа внизу с отступом. Просмотр — всё статично.
 */
const nodeTypes: NodeTypes = {
  status: StatusNode,
  start: StartNode,
  any: AnyNode,
};
const edgeTypes: EdgeTypes = { transition: TransitionEdge };

const FIT = { padding: 0.2, maxZoom: 1 } as const;
const DELETE_KEYS = ['Delete', 'Backspace'];

/** Подписи доступности React Flow — по-русски (I15). */
const ARIA: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default': ui.automation.canvasNodeHint,
  'node.a11yDescription.keyboardDisabled': ui.automation.canvasNodeHint,
  'node.a11yDescription.ariaLiveMessage': ({ x, y }) =>
    `${ui.automation.canvasNodeMoved}: ${Math.round(x)}, ${Math.round(y)}`,
  'edge.a11yDescription.default': ui.automation.canvasEdgeHint,
  'controls.ariaLabel': ui.automation.canvasControls,
  'controls.zoomIn.ariaLabel': ui.automation.zoomIn,
  'controls.zoomOut.ariaLabel': ui.automation.zoomOut,
  'controls.fitView.ariaLabel': ui.automation.fitView,
  'handle.ariaLabel': ui.automation.canvasHandle,
};

export interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onConnect?: OnConnect;
  onReconnect?: OnReconnect;
  isValidConnection?: IsValidConnection;
  onDelete?: OnDelete;
  onNodeDrag?: OnNodeDrag<Node>;
  onNodeDragStop?: OnNodeDrag<Node>;
  onNodeClick?: NodeMouseHandler<Node>;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick?: () => void;
  /** Редактор или чтение. */
  interactive: boolean;
  /** Доп. кнопки панели масштаба (отмена/повтор редактора). */
  controls?: React.ReactNode;
  /** Ключ схемы: сменился — вписать заново (смена типа в редакторе). */
  fitKey?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Размеры узлов, измеренные React Flow, — обратно в объекты узлов
 * (контролируемый режим, наши узлы — производные от документа). Без
 * `measured` каждый новый объект узла (кадр перетаскивания, пересборка графа)
 * считался неизмеренным: React Flow прятал узел и терял его точки
 * подключения до перемера — узлы и стрелки мерцали при перетаскивании, а
 * «узлы измерены» не наступало (холст не вписывался). Объект узла
 * пересоздаётся, только если сменился сам узел или его размер.
 */
function useMeasuredNodes(nodes: Node[]): { nodes: Node[]; onNodesChange: OnNodesChange } {
  const [measured, setMeasured] = useState<ReadonlyMap<string, Dimensions>>(() => new Map());
  const cache = useRef(new WeakMap<Node, { size: Dimensions; node: Node }>());

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    const sizes = changes.flatMap((c) =>
      c.type === 'dimensions' && c.dimensions ? [{ id: c.id, size: c.dimensions }] : [],
    );
    if (sizes.length === 0) return;
    setMeasured((prev) => {
      const fresh = sizes.filter(({ id, size }) => {
        const old = prev.get(id);
        return !old || old.width !== size.width || old.height !== size.height;
      });
      if (fresh.length === 0) return prev;
      const next = new Map(prev);
      for (const { id, size } of fresh) next.set(id, size);
      return next;
    });
  }, []);

  const withSizes = useMemo(
    () =>
      nodes.map((node) => {
        const size = measured.get(node.id);
        if (!size || node.measured) return node;
        const hit = cache.current.get(node);
        if (hit && hit.size === size) return hit.node;
        const next = { ...node, measured: size };
        cache.current.set(node, { size, node: next });
        return next;
      }),
    [nodes, measured],
  );
  return { nodes: withSizes, onNodesChange };
}

/**
 * Вписывание — ОДИН раз, когда узлы измерены, и заново только при смене
 * схемы (`fitKey`). Смена размера холста (выезд правой панели, окно) вид НЕ
 * трогает: граф стоит, край холста его просто обрезает (вердикт владельца
 * 20.10 — «чтобы не дёргалось ничего лишний раз»). Добавление статуса вид
 * тоже не дёргает.
 */
function AutoFit({ fitKey }: { fitKey: string }) {
  const initialized = useNodesInitialized();
  const sized = useStore((s) => s.width > 0 && s.height > 0);
  const { fitView } = useReactFlow();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || !sized || fitted.current === fitKey) return;
    fitted.current = fitKey;
    void fitView(FIT);
  }, [initialized, sized, fitKey, fitView]);
  return null;
}

export function FlowCanvas({
  nodes,
  edges,
  onConnect,
  onReconnect,
  isValidConnection,
  onDelete,
  onNodeDrag,
  onNodeDragStop,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  interactive,
  controls,
  fitKey = '',
  className,
  children,
}: FlowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredNodes(nodes);
  return (
    <div ref={wrapperRef} className={cn('relative h-full w-full', className)}>
      <FlowMarkers />
      <ReactFlow
        nodes={measured.nodes}
        onNodesChange={measured.onNodesChange}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onReconnect={interactive ? onReconnect : undefined}
        isValidConnection={isValidConnection}
        onDelete={onDelete}
        // Delete/Backspace удаляют выделенное, только когда фокус на холсте
        // (или нигде): клавиши в панели, поповерах и диалогах — не удаляют.
        onBeforeDelete={async () => {
          const active = document.activeElement;
          return (
            !active || active === document.body || (wrapperRef.current?.contains(active) ?? false)
          );
        }}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        edgesReconnectable={interactive}
        reconnectRadius={6}
        elementsSelectable={interactive || onNodeClick !== undefined}
        deleteKeyCode={interactive ? DELETE_KEYS : null}
        nodesFocusable={interactive}
        edgesFocusable={interactive}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={24}
        minZoom={0.3}
        maxZoom={1.6}
        attributionPosition="bottom-right"
        ariaLabelConfig={ARIA}
        // Выделение рамкой не нужно: выбор — клик по узлу/ребру.
        selectionOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        preventScrolling
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
        <Controls
          position="bottom-left"
          showInteractive={false}
          fitViewOptions={FIT}
          className="flow-controls"
        >
          {controls}
        </Controls>
        <AutoFit fitKey={fitKey} />
        {children}
      </ReactFlow>
    </div>
  );
}
