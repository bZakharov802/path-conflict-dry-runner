import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planRename,
  planMove,
  detectConflicts,
  formatReport,
} from '../src/index.js';

test('planRename reports no conflicts for disjoint targets', () => {
  const plan = planRename([
    { from: 'a.txt', to: 'b.txt' },
    { from: 'c.txt', to: 'd.txt' },
  ]);
  assert.equal(plan.safe, true);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.sources, ['a.txt', 'c.txt']);
  assert.deepEqual(plan.targets, ['b.txt', 'd.txt']);
});

test('planRename reports a collision when two operations share a target', () => {
  const plan = planRename([
    { from: 'a.txt', to: 'out.txt' },
    { from: 'b.txt', to: 'out.txt' },
  ]);
  assert.equal(plan.safe, false);
  assert.deepEqual(plan.conflicts, [
    { path: 'out.txt', sources: ['a.txt', 'b.txt'] },
  ]);
});

test('planRename does not treat a chained rename as a conflict', () => {
  const plan = planRename([
    { from: 'a.txt', to: 'b.txt' },
    { from: 'b.txt', to: 'c.txt' },
  ]);
  assert.equal(plan.safe, true);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.untouched, ['a.txt']);
});

test('planRename reports untouched sources that no operation targets', () => {
  const plan = planRename([
    { from: 'a.txt', to: 'b.txt' },
    { from: 'c.txt', to: 'd.txt' },
  ]);
  assert.deepEqual(plan.untouched, ['a.txt', 'c.txt']);
});

test('planRename returns a defensive copy of the operations', () => {
  const input = [{ from: 'a.txt', to: 'b.txt' }];
  const plan = planRename(input);
  plan.operations[0].from = 'mutated';
  assert.equal(input[0].from, 'a.txt');
});

test('planRename sorts conflicts by target path', () => {
  const plan = planRename([
    { from: 'x1', to: 'z.txt' },
    { from: 'x2', to: 'z.txt' },
    { from: 'y1', to: 'a.txt' },
    { from: 'y2', to: 'a.txt' },
  ]);
  assert.deepEqual(plan.conflicts.map((c) => c.path), ['a.txt', 'z.txt']);
});

test('planRename rejects malformed operations', () => {
  assert.throws(() => planRename('nope'), TypeError);
  assert.throws(() => planRename([{ from: 'a' }]), TypeError);
  assert.throws(() => planRename([{ from: '', to: 'b' }]), TypeError);
  assert.throws(() => planRename([{ from: 'a', to: 42 }]), TypeError);
});

test('planMove is an alias for planRename', () => {
  const plan = planMove([{ from: 'a.txt', to: 'b.txt' }]);
  assert.equal(plan.safe, true);
  assert.deepEqual(plan.operations, [{ from: 'a.txt', to: 'b.txt' }]);
});

test('detectConflicts accepts the same shape as planRename', () => {
  const plan = detectConflicts([
    { from: 'a', to: 'x' },
    { from: 'b', to: 'x' },
  ]);
  assert.equal(plan.safe, false);
  assert.deepEqual(plan.conflicts, [{ path: 'x', sources: ['a', 'b'] }]);
});

test('formatReport renders a safe plan', () => {
  const plan = planRename([{ from: 'a.txt', to: 'b.txt' }]);
  assert.equal(
    formatReport(plan),
    'operations: 1\nsafe: yes\nconflicts: none\nuntouched: a.txt',
  );
});

test('formatReport lists each conflict with its sources', () => {
  const plan = planRename([
    { from: 'a.txt', to: 'out.txt' },
    { from: 'b.txt', to: 'out.txt' },
  ]);
  assert.equal(
    formatReport(plan),
    'operations: 2\nsafe: no\nconflicts: 1\n  out.txt <- a.txt, b.txt\nuntouched: a.txt, b.txt',
  );
});

test('formatReport rejects values that are not plans', () => {
  assert.throws(() => formatReport(null), TypeError);
  assert.throws(() => formatReport({ operations: [] }), TypeError);
});
