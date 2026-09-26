import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTimes, summarizeMasks } from './analysis.mjs';

test('reports observed range without inventing missing frames', () => {
  const result = summarizeMasks([{ area: 100 }, { area: null }, { area: 60 }, { area: 80 }]);
  assert.equal(result.valid.length, 3);
  assert.equal(result.range, 0.4);
  assert.equal(summarizeMasks([{ area: 2 }, { area: null }]).range, null);
});

test('sampling stays inside the clip near either boundary', () => {
  const times = sampleTimes(100, 2, 7, 1.2);
  assert.equal(times.length, 7);
  assert.ok(times[0] >= 0);
  assert.ok(times.at(-1) < 2);
  assert.deepEqual(sampleTimes(0, NaN, 7, 1.2), []);
});
