import '@xyflow/react/dist/base.css';
import './flow-theme.css';

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type EdgeTypes,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { cn } from '@nodus/ui/lib/utils';

import { StartNode } from './start-node.js';
import { StatusNode } from './status-node.js';
import { TransitionEdge } from './transition-edge.js';

/**
 * Единый движок холста схем (ADR-0022): обёртка React Flow с нашими
 * настройками — потребители (редактор маршрутов, «Схема маршрута», будущая
 * схема проектов) кормят готовые nodes/edges и обрабатывают события.
 * nodeTypes/edgeTypes — на уровне модуля (стабильные ссылки).
 */
const nodeTypes: NodeTypes = {
  status: StatusNode,
  start: StartNode,
};
const edgeTypes: EdgeTypes = { transition: TransitionEdge };

export interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onConnect?: OnConnect;
  onNodeDrag?: OnNodeDrag<Node>;
  onNodeDragStop?: OnNodeDrag<Node>;
  onNodeClick?: NodeMouseHandler<Node>;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick?: () => void;
  /** Редактор или чтение. */
  interactive: boolean;
  fitView?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDrag,
  onNodeDragStop,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  interactive,
  fitView = false,
  className,
  children,
}: FlowCanvasProps) {
  return (
    <div className={cn('h-full w-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable
        nodesFocusable
        edgesFocusable
        connectionMode={ConnectionMode.Loose}
        minZoom={0.3}
        maxZoom={1.6}
        fitView={fitView}
        fitViewOptions={{ padding: 0.2, minZoom: 0.7, maxZoom: 1 }}
        proOptions={{ hideAttribution: false }}
        // Выделение рамкой не нужно: выбор — клик по узлу/ребру.
        selectionOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        preventScrolling
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
        {children}
      </ReactFlow>
    </div>
  );
}
