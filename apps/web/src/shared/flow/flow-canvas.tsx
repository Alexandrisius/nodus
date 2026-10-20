import '@xyflow/react/dist/base.css';
import './flow-theme.css';

import { useEffect, useRef } from 'react';
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
  type EdgeTypes,
  type IsValidConnection,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnDelete,
  type OnNodeDrag,
  type OnReconnect,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { AnyNode } from './any-node.js';
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
  className?: string;
  children?: React.ReactNode;
}

/**
 * Вписывание: первое — когда узлы измерены; дальше — только при смене
 * размера контейнера (окно, раскрытие диалога) и пока пользователь сам не
 * двигал холст. Добавление статуса вид не дёргает. Без минимального масштаба
 * подгонки — края схемы («Создание задачи», подписи справа) не обрезаются.
 */
function AutoFit({ userMoved }: { userMoved: React.RefObject<boolean> }) {
  const initialized = useNodesInitialized();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { fitView } = useReactFlow();
  const fitted = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!initialized || width === 0 || height === 0) return;
    const previous = fitted.current;
    if (previous && previous.width === width && previous.height === height) return;
    fitted.current = { width, height };
    if (previous && userMoved.current) return;
    void fitView(FIT);
  }, [initialized, width, height, fitView, userMoved]);
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
  className,
  children,
}: FlowCanvasProps) {
  const userMoved = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapperRef} className={cn('h-full w-full', className)}>
      <ReactFlow
        nodes={nodes}
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
        onMoveStart={(event) => {
          // Двигал сам пользователь (у программного fitView события нет).
          if (event) userMoved.current = true;
        }}
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
        <AutoFit userMoved={userMoved} />
        {children}
      </ReactFlow>
    </div>
  );
}
