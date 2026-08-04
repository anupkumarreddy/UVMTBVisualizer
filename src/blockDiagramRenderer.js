import * as d3 from "d3";

const LEAF_WIDTH = 210;
const LEAF_HEIGHT = 76;
const COLLAPSED_WIDTH = 272;
const COLLAPSED_HEIGHT = 68;
const HEADER_HEIGHT = 62;
const CONTAINER_PADDING = 22;
const BLOCK_GAP = 18;

function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function allDescendants(node) {
  const descendants = [];

  function visit(current) {
    descendants.push(current);
    for (const child of current.children ?? current._children ?? []) visit(child);
  }

  visit(node);
  return descendants;
}

function nestedBlockCount(node) {
  return Math.max(0, allDescendants(node).length - 1);
}

function preferredPacking(node) {
  if (node.data.category === "Agent") return { targetWidth: Number.POSITIVE_INFINITY, maxColumns: 3 };
  if (node.data.category === "Environment" || node.depth === 0) {
    return { targetWidth: 1450, maxColumns: 3 };
  }
  return { targetWidth: 980, maxColumns: 3 };
}

function packRows(children, { targetWidth, maxColumns }) {
  const rows = [];
  let row = [];
  let rowWidth = 0;

  for (const child of children) {
    const nextWidth = row.length ? rowWidth + BLOCK_GAP + child.layoutWidth : child.layoutWidth;
    if (row.length && (nextWidth > targetWidth || row.length >= maxColumns)) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }

    row.push(child);
    rowWidth = row.length === 1 ? child.layoutWidth : rowWidth + BLOCK_GAP + child.layoutWidth;
  }

  if (row.length) rows.push(row);
  return rows;
}

/**
 * Interactive nested block renderer for UVM structural topology.
 *
 * Parent components become labeled containers and children are packed inside
 * them. This mirrors familiar UVM architecture diagrams (test > env > agents
 * > driver/monitor/sequencer) without inventing connections absent from the
 * static print_topology() table.
 */
export class BlockDiagramRenderer {
  constructor(svgElement, { onSelect } = {}) {
    this.svgElement = svgElement;
    this.svg = d3.select(svgElement);
    this.onSelect = onSelect;
    this.root = null;
    this.nextId = 0;
    this.selectedId = null;
    this.query = "";
    this.matchIds = new Set();

    this.viewport = this.svg.append("g").attr("class", "diagram-viewport");
    this.blocksLayer = this.viewport.append("g").attr("class", "blocks-layer");

    this.zoom = d3
      .zoom()
      .scaleExtent([0.18, 2.5])
      .on("zoom", (event) => this.viewport.attr("transform", event.transform));

    this.svg.call(this.zoom).on("dblclick.zoom", null);
    this.svg.on("click", (event) => {
      if (event.target === this.svgElement) this.selectNode(null);
    });
  }

  load(data) {
    this.root = d3.hierarchy(data, (node) => node.children);
    this.nextId = 0;
    this.root.each((node) => {
      node.id = ++this.nextId;
      node.previousX = 0;
      node.previousY = 0;
    });

    this.selectedId = null;
    this.query = "";
    this.matchIds.clear();
    this.update(this.root, false);
    requestAnimationFrame(() => this.fitToView(false));
  }

  clear() {
    this.root = null;
    this.blocksLayer.selectAll("*").remove();
    this.svg.call(this.zoom.transform, d3.zoomIdentity);
  }

  measure(node) {
    if (!node.children?.length) {
      const isCollapsed = Boolean(node._children?.length);
      node.layoutWidth = isCollapsed ? COLLAPSED_WIDTH : LEAF_WIDTH;
      node.layoutHeight = isCollapsed ? COLLAPSED_HEIGHT : LEAF_HEIGHT;
      return;
    }

    for (const child of node.children) this.measure(child);

    const rows = packRows(node.children, preferredPacking(node));
    let contentHeight = 0;
    let widestRow = 0;

    for (const [rowIndex, row] of rows.entries()) {
      const rowWidth = row.reduce(
        (total, child, childIndex) => total + child.layoutWidth + (childIndex ? BLOCK_GAP : 0),
        0
      );
      const rowHeight = d3.max(row, (child) => child.layoutHeight) ?? 0;
      widestRow = Math.max(widestRow, rowWidth);
      contentHeight += rowHeight + (rowIndex ? BLOCK_GAP : 0);
    }

    node.packedRows = rows;
    node.layoutWidth = Math.max(300, widestRow + CONTAINER_PADDING * 2);
    node.layoutHeight = HEADER_HEIGHT + CONTAINER_PADDING + contentHeight + CONTAINER_PADDING;
  }

  position(node, x, y) {
    node.layoutX = x;
    node.layoutY = y;

    if (!node.children?.length) return;

    let rowY = y + HEADER_HEIGHT + CONTAINER_PADDING;
    for (const row of node.packedRows) {
      const rowWidth = row.reduce(
        (total, child, childIndex) => total + child.layoutWidth + (childIndex ? BLOCK_GAP : 0),
        0
      );
      const rowHeight = d3.max(row, (child) => child.layoutHeight) ?? 0;
      let childX = x + (node.layoutWidth - rowWidth) / 2;

      for (const child of row) {
        const childY = rowY + (rowHeight - child.layoutHeight) / 2;
        this.position(child, childX, childY);
        childX += child.layoutWidth + BLOCK_GAP;
      }

      rowY += rowHeight + BLOCK_GAP;
    }
  }

  update(source = this.root, animate = true) {
    if (!this.root) return;

    this.measure(this.root);
    this.position(this.root, 0, 0);

    const nodes = this.root.descendants();
    const duration = animate ? 240 : 0;
    const transition = this.svg.transition().duration(duration).ease(d3.easeCubicOut);
    const nodeSelection = this.blocksLayer.selectAll("g.block-node").data(nodes, (node) => node.id);

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "block-node")
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("transform", `translate(${source.previousX ?? source.layoutX},${source.previousY ?? source.layoutY})`)
      .style("opacity", 0)
      .style("--block-color", (node) => node.data.color)
      .on("click", (event, node) => {
        event.stopPropagation();
        this.selectNode(node);
      })
      .on("keydown", (event, node) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.selectNode(node);
        }

        if (event.key === " " && (node.children || node._children)) {
          event.preventDefault();
          this.toggleNode(node);
        }
      });

    nodeEnter.append("rect").attr("class", "block-frame").attr("rx", 12);
    nodeEnter.append("rect").attr("class", "block-header").attr("rx", 12);
    nodeEnter.append("line").attr("class", "block-divider");
    nodeEnter.append("rect").attr("class", "block-accent").attr("rx", 2.5);
    nodeEnter.append("circle").attr("class", "block-dot").attr("r", 4.5);
    nodeEnter.append("text").attr("class", "block-category");
    nodeEnter.append("text").attr("class", "block-name");
    nodeEnter.append("text").attr("class", "block-type").attr("text-anchor", "end");

    const toggle = nodeEnter
      .append("g")
      .attr("class", "block-toggle")
      .on("click", (event, node) => {
        event.stopPropagation();
        this.toggleNode(node);
      });
    toggle.append("rect").attr("width", 36).attr("height", 24).attr("x", -18).attr("y", -12).attr("rx", 7);
    toggle.append("text").attr("text-anchor", "middle").attr("dy", "0.34em");

    nodeEnter.append("title");

    const nodeMerge = nodeEnter.merge(nodeSelection);
    nodeMerge
      .style("--block-color", (node) => node.data.color)
      .attr("aria-label", (node) => `${node.data.name}, ${node.data.type}, ${node.data.category}`)
      .classed("is-container", (node) => Boolean(node.children?.length))
      .classed("is-leaf", (node) => !node.children?.length && !node._children?.length)
      .classed("is-collapsed", (node) => Boolean(node._children?.length))
      .classed("is-selected", (node) => node.id === this.selectedId)
      .classed("is-match", (node) => this.matchIds.has(node.id))
      .classed("is-dimmed", (node) => Boolean(this.query) && !this.matchIds.has(node.id));

    nodeMerge
      .select("rect.block-frame")
      .attr("width", (node) => node.layoutWidth)
      .attr("height", (node) => node.layoutHeight);

    nodeMerge
      .select("rect.block-header")
      .attr("width", (node) => node.layoutWidth)
      .attr("height", (node) => (node.children?.length ? HEADER_HEIGHT : node.layoutHeight));

    nodeMerge
      .select("line.block-divider")
      .attr("x1", 0)
      .attr("x2", (node) => node.layoutWidth)
      .attr("y1", HEADER_HEIGHT)
      .attr("y2", HEADER_HEIGHT)
      .classed("is-hidden", (node) => !node.children?.length);

    nodeMerge
      .select("rect.block-accent")
      .attr("x", 9)
      .attr("y", (node) => (node.children?.length ? 11 : 13))
      .attr("width", 5)
      .attr("height", (node) => (node.children?.length ? 40 : node.layoutHeight - 26));

    nodeMerge
      .select("circle.block-dot")
      .attr("cx", 28)
      .attr("cy", (node) => (node.children?.length ? 18 : 24));

    nodeMerge
      .select("text.block-category")
      .attr("x", 39)
      .attr("y", (node) => (node.children?.length ? 21 : 27))
      .text((node) => node.data.category.toUpperCase());

    nodeMerge
      .select("text.block-name")
      .attr("x", 26)
      .attr("y", (node) => (node.children?.length ? 46 : 52))
      .text((node) => truncate(node.data.name, node.layoutWidth > 400 ? 34 : 22));

    nodeMerge
      .select("text.block-type")
      .attr("x", (node) => node.layoutWidth - (node.children || node._children ? 58 : 18))
      .attr("y", (node) => (node.children?.length ? 21 : 27))
      .text((node) => truncate(node.data.type, node.layoutWidth > 420 ? 32 : 19));

    nodeMerge
      .select("g.block-toggle")
      .attr("transform", (node) => `translate(${node.layoutWidth - 28},${node.children?.length ? 39 : 42})`)
      .classed("is-hidden", (node) => !node.children && !node._children);

    nodeMerge.select("g.block-toggle text").text((node) => {
      if (node._children) {
        const count = nestedBlockCount(node);
        return count > 99 ? "99+" : String(count);
      }
      return "−";
    });

    nodeMerge.select("title").text((node) => `${node.data.path}\n${node.data.type}`);

    nodeMerge
      .transition(transition)
      .attr("transform", (node) => `translate(${node.layoutX},${node.layoutY})`)
      .style("opacity", 1);

    nodeSelection
      .exit()
      .transition(transition)
      .attr("transform", `translate(${source.layoutX},${source.layoutY})`)
      .style("opacity", 0)
      .remove();

    for (const node of nodes) {
      node.previousX = node.layoutX;
      node.previousY = node.layoutY;
    }
  }

  toggleNode(node) {
    if (node.children) {
      node._children = node.children;
      node.children = null;
    } else if (node._children) {
      node.children = node._children;
      node._children = null;
    }

    this.update(node);
    if (this.query) this.search(this.query, false);
  }

  selectNode(node) {
    this.selectedId = node?.id ?? null;
    this.blocksLayer
      .selectAll("g.block-node")
      .classed("is-selected", (candidate) => candidate.id === this.selectedId);
    this.onSelect?.(node?.data ?? null);
  }

  search(query, centerFirst = true) {
    this.query = String(query ?? "").trim().toLowerCase();
    this.matchIds.clear();

    if (!this.root || !this.query) {
      this.update(this.root, false);
      return [];
    }

    const matches = allDescendants(this.root).filter((node) => {
      const searchable = `${node.data.name} ${node.data.type}`.toLowerCase();
      return searchable.includes(this.query);
    });

    for (const match of matches) {
      this.matchIds.add(match.id);
      let ancestor = match.parent;
      while (ancestor) {
        if (ancestor._children) {
          ancestor.children = ancestor._children;
          ancestor._children = null;
        }
        ancestor = ancestor.parent;
      }
    }

    this.update(this.root, false);
    if (centerFirst && matches.length) requestAnimationFrame(() => this.centerOnNode(matches[0]));
    return matches.map((node) => node.data);
  }

  expandAll() {
    if (!this.root) return;
    for (const node of allDescendants(this.root)) {
      if (node._children) {
        node.children = node._children;
        node._children = null;
      }
    }
    this.update(this.root);
    requestAnimationFrame(() => this.fitToView());
  }

  fitToView(animate = true) {
    if (!this.root) return;
    const bounds = this.svgElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const padding = 96;
    const scale = Math.max(
      0.18,
      Math.min(
        1.12,
        (bounds.width - padding * 2) / this.root.layoutWidth,
        (bounds.height - padding * 2) / this.root.layoutHeight
      )
    );
    const translateX = (bounds.width - this.root.layoutWidth * scale) / 2;
    const translateY = (bounds.height - this.root.layoutHeight * scale) / 2;
    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    const target = animate ? this.svg.transition().duration(300).ease(d3.easeCubicOut) : this.svg;
    target.call(this.zoom.transform, transform);
  }

  centerOnNode(node) {
    const bounds = this.svgElement.getBoundingClientRect();
    const currentTransform = d3.zoomTransform(this.svgElement);
    const scale = Math.max(0.72, currentTransform.k);
    const centerX = node.layoutX + node.layoutWidth / 2;
    const centerY = node.layoutY + node.layoutHeight / 2;
    const transform = d3.zoomIdentity
      .translate(bounds.width / 2 - centerX * scale, bounds.height / 2 - centerY * scale)
      .scale(scale);
    this.svg.transition().duration(320).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
  }
}
