/**
 * Ordered display-category rules. The first matching rule wins.
 * Keep this table separate from rendering so UVM naming conventions and the
 * visual palette can evolve without changing the canvas code.
 */
export const TYPE_CATEGORIES = [
  { category: "Environment", substrings: ["env"], color: "#4C6EF5" },
  { category: "Agent", substrings: ["agent"], color: "#7048E8" },
  { category: "Driver", substrings: ["driver", "drv"], color: "#E8590C" },
  { category: "Monitor", substrings: ["monitor", "mon"], color: "#2F9E44" },
  { category: "Sequencer", substrings: ["sequencer", "seqr"], color: "#F08C00" },
  { category: "Scoreboard", substrings: ["scoreboard", "sb"], color: "#E03131" },
  { category: "Sequence", substrings: ["sequence", "seq"], color: "#AE3EC9" },
  { category: "Test", substrings: ["test"], color: "#1098AD" },
  { category: "Register / RAL", substrings: ["reg_block", "_rm", "ral"], color: "#5C940D" }
];

export const DEFAULT_CATEGORY = {
  category: "Unknown",
  substrings: [],
  color: "#868E96"
};

function matchCategory(value) {
  const normalizedValue = String(value ?? "").toLowerCase();
  return TYPE_CATEGORIES.find((rule) =>
    rule.substrings.some((substring) => normalizedValue.includes(substring))
  );
}

/**
 * Infer a component's visual category from its type, then its instance name.
 *
 * @param {string} name
 * @param {string} type
 * @returns {{ category: string, color: string }}
 */
export function inferType(name, type) {
  const match = matchCategory(type) ?? matchCategory(name) ?? DEFAULT_CATEGORY;
  return { category: match.category, color: match.color };
}
