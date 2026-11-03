const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
};

const normalizeOperation = (op) => {
  if (!isPlainObject(op)) {
    throw new TypeError('each operation must be an object');
  }
  assertNonEmptyString(op.from, 'operation.from');
  assertNonEmptyString(op.to, 'operation.to');
  return { from: op.from, to: op.to };
};

const normalizeOperations = (operations) => {
  if (!Array.isArray(operations)) {
    throw new TypeError('operations must be an array');
  }
  return operations.map(normalizeOperation);
};

/**
 * Computes a dry-run plan for a batch of rename or move operations.
 *
 * The result describes the final state only: which source paths are vacated,
 * which target paths are occupied, and which targets are requested by more
 * than one operation. It does not mutate the filesystem or the input array.
 *
 * @param {Array<{from: string, to: string}>} operations
 * @returns {{
 *   operations: Array<{from: string, to: string}>,
 *   sources: string[],
 *   targets: string[],
 *   conflicts: Array<{path: string, sources: string[]}>,
 *   untouched: string[],
 *   safe: boolean
 * }}
 */
export function planRename(operations) {
  return detectConflicts(normalizeOperations(operations));
}

/**
 * Alias for {@link planRename}. A move is a rename across directories; the
 * conflict analysis is identical, so this exists purely for readability at the
 * call site.
 *
 * @param {Array<{from: string, to: string}>} operations
 * @returns {ReturnType<typeof planRename>}
 */
export function planMove(operations) {
  return planRename(operations);
}

/**
 * Core conflict detector shared by the public planners.
 *
 * Design choice: conflicts are reported when two or more operations target the
 * same path. A target that is also the source of another operation is NOT a
 * conflict by itself, because a batch rename can legitimately swap or chain
 * paths (for example a -> b and b -> c). Callers who need to reject chained
 * renames can inspect `sources` and `targets` themselves.
 *
 * @param {Array<{from: string, to: string}>} operations
 * @returns {{
 *   operations: Array<{from: string, to: string}>,
 *   sources: string[],
 *   targets: string[],
 *   conflicts: Array<{path: string, sources: string[]}>,
 *   untouched: string[],
 *   safe: boolean
 * }}
 */
export function detectConflicts(operations) {
  const ops = normalizeOperations(operations);
  const sources = [];
  const targets = [];
  const targetSources = new Map();

  for (const op of ops) {
    sources.push(op.from);
    targets.push(op.to);
    if (!targetSources.has(op.to)) {
      targetSources.set(op.to, []);
    }
    targetSources.get(op.to).push(op.from);
  }

  const sourceSet = new Set(sources);
  const targetSet = new Set(targets);
  const conflicts = [];

  for (const [path, fromList] of targetSources) {
    if (fromList.length > 1) {
      conflicts.push({ path, sources: [...fromList] });
    }
  }

  // Deterministic ordering keeps tests and diffs stable regardless of Map
  // insertion order in the caller's input.
  conflicts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const untouched = [];
  for (const path of sourceSet) {
    if (!targetSet.has(path)) {
      untouched.push(path);
    }
  }
  untouched.sort();

  return {
    operations: ops.map((op) => ({ from: op.from, to: op.to })),
    sources: [...new Set(sources)].sort(),
    targets: [...new Set(targets)].sort(),
    conflicts,
    untouched,
    safe: conflicts.length === 0,
  };
}

/**
 * Renders a plan as a human-readable string. Intended for CLI output and test
 * snapshots; the format is stable but not machine-parseable.
 *
 * @param {ReturnType<typeof planRename>} plan
 * @returns {string}
 */
export function formatReport(plan) {
  if (!isPlainObject(plan) || !Array.isArray(plan.operations)) {
    throw new TypeError('plan must be an object returned by planRename or planMove');
  }

  const lines = [];
  lines.push(`operations: ${plan.operations.length}`);
  lines.push(`safe: ${plan.safe ? 'yes' : 'no'}`);

  if (plan.conflicts.length === 0) {
    lines.push('conflicts: none');
  } else {
    lines.push(`conflicts: ${plan.conflicts.length}`);
    for (const conflict of plan.conflicts) {
      lines.push(`  ${conflict.path} <- ${conflict.sources.join(', ')}`);
    }
  }

  if (plan.untouched.length > 0) {
    lines.push(`untouched: ${plan.untouched.join(', ')}`);
  }

  return lines.join('\n');
}
