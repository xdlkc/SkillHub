import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTab, parseHash, routeLabel } from '../src/router.ts';

test('settings hash maps to the settings route and navigation metadata', () => {
  const route = parseHash('#/settings');

  assert.deepEqual(route, { name: 'settings' });
  assert.equal(routeLabel(route), '设置');
  assert.equal(activeTab(route), 'settings');
});
