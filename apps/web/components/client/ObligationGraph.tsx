// ============================================================================
// FILE: apps/web/components/client/ObligationGraph.tsx
// D3.js force-directed graph of client obligations.
// Nodes: client (center) → countries → obligations → deadlines
// Color by status: green=OK, amber=próximo, red=vencido
// ============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Badge } from '../ui/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: 'client' | 'country' | 'obligation' | 'deadline' | 'regulator';
  readonly status?: string;
  readonly area?: string;
  readonly dueDate?: string;
  readonly properties?: Record<string, unknown>;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly relationship: string;
}

interface D3Node extends d3.SimulationNodeDatum {
  readonly id: string;
  readonly label: string;
  readonly type: GraphNode['type'];
  readonly status?: string;
  readonly area?: string;
  readonly dueDate?: string;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  readonly relationship: string;
}

interface ObligationGraphProps {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly onNodeClick?: (node: GraphNode) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  client: '#4F2D7F',
  country: '#3b82f6',
  obligation: '#6b7280',
  deadline: '#f59e0b',
  regulator: '#8b5cf6',
};

const NODE_SIZES: Record<string, number> = {
  client: 24,
  country: 18,
  obligation: 14,
  deadline: 10,
  regulator: 12,
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#10b981',
  IN_PROGRESS: '#3b82f6',
  PENDING: '#f59e0b',
  OVERDUE: '#dc2626',
};

// ---------------------------------------------------------------------------
// ObligationGraph
// ---------------------------------------------------------------------------

export function ObligationGraph({ nodes, edges, onNodeClick }: ObligationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);

  // Get unique areas for filter
  const areas = Array.from(new Set(nodes.filter((n) => n.area).map((n) => n.area!)));

  // Filter nodes/edges by area
  const filteredNodes = areaFilter
    ? nodes.filter((n) => n.type === 'client' || n.type === 'country' || n.area === areaFilter)
    : nodes;

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode((prev) => (prev?.id === node.id ? null : node));
      onNodeClick?.(node);
    },
    [onNodeClick],
  );

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 500;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Zoom container
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Prepare D3 data (mutable copies)
    const d3Nodes: D3Node[] = filteredNodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    }));

    const nodeMap = new Map(d3Nodes.map((n) => [n.id, n]));

    const d3Links: D3Link[] = filteredEdges
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        relationship: e.relationship,
      }))
      .filter((l) => l.source && l.target);

    // Simulation
    const simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(d3Links).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => (NODE_SIZES[(d as D3Node).type] ?? 10) + 5));

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(d3Links)
      .join('line')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Link labels
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(d3Links)
      .join('text')
      .text((d) => d.relationship.replace(/_/g, ' '))
      .attr('font-size', 7)
      .attr('fill', '#9ca3af')
      .attr('text-anchor', 'middle');

    // Nodes
    const node = g.append('g')
      .selectAll<SVGGElement, D3Node>('g')
      .data(d3Nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Node circles
    node.append('circle')
      .attr('r', (d) => NODE_SIZES[d.type] ?? 10)
      .attr('fill', (d) => {
        if (d.status && STATUS_COLORS[d.status]) return STATUS_COLORS[d.status]!;
        return NODE_COLORS[d.type] ?? '#6b7280';
      })
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .on('click', (_event, d) => {
        handleNodeClick(d);
      });

    // Node labels
    node.append('text')
      .text((d) => truncate(d.label, 16))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (NODE_SIZES[d.type] ?? 10) + 12)
      .attr('font-size', 9)
      .attr('fill', '#374151')
      .attr('font-weight', (d) => (d.type === 'client' ? 'bold' : 'normal'));

    // Type icon inside node
    node.append('text')
      .text((d) => NODE_ICONS[d.type] ?? '')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', (d) => (NODE_SIZES[d.type] ?? 10) * 0.8);

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x!)
        .attr('y1', (d) => (d.source as D3Node).y!)
        .attr('x2', (d) => (d.target as D3Node).x!)
        .attr('y2', (d) => (d.target as D3Node).y!);

      linkLabel
        .attr('x', (d) => ((d.source as D3Node).x! + (d.target as D3Node).x!) / 2)
        .attr('y', (d) => ((d.source as D3Node).y! + (d.target as D3Node).y!) / 2);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredEdges, handleNodeClick]);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Grafo de Obligaciones</h2>

        {/* Area filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setAreaFilter(null)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              !areaFilter ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            Todos
          </button>
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setAreaFilter(areaFilter === area ? null : area)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors capitalize ${
                areaFilter === area ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <svg ref={svgRef} className="w-full" style={{ minHeight: 500 }} />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-md border border-gray-200 p-2 text-xs space-y-1">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-gray-600 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected node detail drawer */}
      {selectedNode && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">{selectedNode.label}</h3>
            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{selectedNode.type}</Badge>
            {selectedNode.area && <Badge variant="info">{selectedNode.area}</Badge>}
            {selectedNode.status && (
              <Badge variant={selectedNode.status === 'COMPLETED' ? 'success' : selectedNode.status === 'OVERDUE' ? 'high' : 'warning'}>
                {selectedNode.status}
              </Badge>
            )}
            {selectedNode.dueDate && (
              <span className="text-gray-500">Deadline: {selectedNode.dueDate}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE_ICONS: Record<string, string> = {
  client: '🏢',
  country: '🌍',
  obligation: '📋',
  deadline: '⏰',
  regulator: '🏛️',
};

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}
