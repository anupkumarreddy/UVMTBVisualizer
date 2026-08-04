import { inferType } from "./typeInference.js";

const NO_TOPOLOGY_ERROR = "No UVM topology block found in this file.";
const MALFORMED_TOPOLOGY_ERROR = "A UVM topology table was found, but its hierarchy is malformed.";

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

/** Remove transcript prefixes such as Questa's "# " while preserving hierarchy indentation. */
function normalizeTranscriptLine(line) {
  return stripAnsi(line).replace(/^\s*[#>|]\s?/, "");
}

function isDivider(line) {
  const normalized = normalizeTranscriptLine(line).trim();
  return /^(?:[-=─━]{6,}|\+?[-=]{6,}\+?)$/.test(normalized);
}

function isTopologyHeader(line) {
  const columns = normalizeTranscriptLine(line)
    .trim()
    .split(/\s+/)
    .map((column) => column.toLowerCase().replace(/[^a-z]/g, ""));

  return (
    columns.length >= 3 &&
    columns[0] === "name" &&
    columns[1] === "type" &&
    columns[2] === "size"
  );
}

function previousNonEmptyLine(lines, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (normalizeTranscriptLine(lines[index]).trim()) return index;
  }
  return -1;
}

function nextNonEmptyLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (normalizeTranscriptLine(lines[index]).trim()) return index;
  }
  return -1;
}

function locateTopologyTable(lines) {
  for (let headerIndex = 0; headerIndex < lines.length; headerIndex += 1) {
    if (!isTopologyHeader(lines[headerIndex])) continue;

    const openingDivider = previousNonEmptyLine(lines, headerIndex - 1);
    const dataDivider = nextNonEmptyLine(lines, headerIndex + 1);
    if (openingDivider < 0 || dataDivider < 0) continue;
    if (!isDivider(lines[openingDivider]) || !isDivider(lines[dataDivider])) continue;

    for (let endDivider = dataDivider + 1; endDivider < lines.length; endDivider += 1) {
      if (isDivider(lines[endDivider])) {
        return { start: dataDivider + 1, end: endDivider };
      }
    }
  }

  return null;
}

function indentationWidth(value) {
  let width = 0;
  for (const character of value) width += character === "\t" ? 2 : 1;
  return width;
}

function parseTableRow(line) {
  const normalized = normalizeTranscriptLine(line).replace(/\s+$/, "");
  if (!normalized.trim()) return null;

  const leadingWhitespace = normalized.match(/^\s*/)?.[0] ?? "";
  const content = normalized.slice(leadingWhitespace.length).trim();
  // Instance names and SV class names cannot contain whitespace. Token parsing
  // therefore remains reliable even when a long value exhausts its print column.
  const columns = content.split(/\s+/).filter(Boolean);
  if (columns.length < 3) return null;

  return {
    indent: indentationWidth(leadingWhitespace),
    name: columns[0],
    type: columns[1],
    size: columns[2]
  };
}

function createNode(row, path) {
  const { category, color } = inferType(row.name, row.type);
  return {
    name: row.name,
    type: row.type,
    size: row.size,
    category,
    color,
    path,
    children: []
  };
}

function buildHierarchy(rows) {
  if (rows.length === 0) return { error: NO_TOPOLOGY_ERROR };

  const baseIndent = Math.min(...rows.map((row) => row.indent));
  const normalizedRows = rows.map((row) => ({ ...row, indent: row.indent - baseIndent }));
  const indentUnit = normalizedRows.find((row) => row.indent > 0)?.indent ?? 1;
  const usesConsistentIndentUnit = normalizedRows.every((row) => row.indent % indentUnit === 0);
  const rankedRows = normalizedRows.map((row) => ({
    ...row,
    // Standard printer output uses a fixed indent unit. Customized printers
    // occasionally do not, in which case raw whitespace ordering is safer.
    rank: usesConsistentIndentUnit ? row.indent / indentUnit : row.indent
  }));
  const rootRow = rankedRows[0];

  if (rootRow.indent !== 0) return { error: MALFORMED_TOPOLOGY_ERROR };

  const root = createNode(rootRow, rootRow.name);
  const stack = [{ rank: rootRow.rank, node: root }];

  for (const row of rankedRows.slice(1)) {
    while (stack.length && stack[stack.length - 1].rank >= row.rank) stack.pop();

    const parentEntry = stack[stack.length - 1];
    if (!parentEntry || row.rank <= parentEntry.rank) {
      return { error: MALFORMED_TOPOLOGY_ERROR };
    }

    const node = createNode(row, `${parentEntry.node.path}.${row.name}`);
    parentEntry.node.children.push(node);
    stack.push({ rank: row.rank, node });
  }

  return { root };
}

/**
 * Parse the UVM printer table embedded in a complete simulator log.
 *
 * @param {string} logText full raw contents of a selected log file
 * @returns {{ root: object } | { error: string }}
 */
export function parseTopology(logText) {
  if (typeof logText !== "string" || !logText.trim()) {
    return { error: NO_TOPOLOGY_ERROR };
  }

  const lines = logText.replace(/\r\n?/g, "\n").split("\n");
  const table = locateTopologyTable(lines);
  if (!table) return { error: NO_TOPOLOGY_ERROR };

  const rows = lines
    .slice(table.start, table.end)
    .map(parseTableRow)
    .filter(Boolean);

  return buildHierarchy(rows);
}

export const PARSER_ERRORS = {
  NO_TOPOLOGY_ERROR,
  MALFORMED_TOPOLOGY_ERROR
};
