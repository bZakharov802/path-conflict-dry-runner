# path-conflict-dry-runner

Simulates a batch rename or move operation and reports which target paths would collide before execution.

## Usage

```js
import { planRename, formatReport } from 'path-conflict-dry-runner';

const plan = planRename([
  { from: 'a.txt', to: 'out.txt' },
  { from: 'b.txt', to: 'out.txt' },
]);

console.log(plan.safe);        // false
console.log(plan.conflicts);   // [{ path: 'out.txt', sources: ['a.txt', 'b.txt'] }]
console.log(formatReport(plan));
// operations: 2
// safe: no
// conflicts: 1
//   out.txt <- a.txt, b.txt
// untouched: a.txt, b.txt
```

## Why this exists

Batch renames are easy to get wrong: a script that moves many files can silently overwrite one destination with several sources. This library runs the plan in memory and tells you which targets are requested more than once, so you can abort before touching the filesystem.

The trade-off is scope. `path-conflict-dry-runner` only looks at the final target paths. It does not stat the disk, so it cannot warn about a target that already exists on disk but is not part of the batch. That check belongs in the caller, where the filesystem is actually available.

## The edge you will hit

A chained rename such as `a -> b` and `b -> c` is not a conflict here. The final state is well defined (both `a` and `b` are vacated, `c` is occupied), and rejecting it would make legal renames impossible. If your workflow must forbid chained renames, inspect `plan.sources` and `plan.targets` and reject the plan yourself.

## API

- `planRename(operations)` — returns a plan object. Throws `TypeError` for malformed input.
- `planMove(operations)` — alias for `planRename`; a move is a rename across directories.
- `detectConflicts(operations)` — the underlying detector, same return shape.
- `formatReport(plan)` — renders a plan as a stable, human-readable string.

The plan object has the following fields:

- `operations`: a defensive copy of the input operations.
- `sources`: sorted unique source paths.
- `targets`: sorted unique target paths.
- `conflicts`: sorted list of `{ path, sources }` for targets requested by more than one operation.
- `untouched`: sorted sources that no operation targets.
- `safe`: `true` when `conflicts` is empty.
