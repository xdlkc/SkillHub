import type { AgentInfo } from '../types';

export function selectVisibleAgentIds(current: ReadonlySet<string>, visibleIds: readonly string[]) {
  return new Set([...current, ...visibleIds]);
}

export function toggleAgentSelection(current: ReadonlySet<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function clearAgentSelection() {
  return new Set<string>();
}

export function isBulkActionDisabled(selectedCount: number, preferenceBusy: boolean) {
  return selectedCount === 0 || preferenceBusy;
}

export function applyAgentEnabled(agents: readonly AgentInfo[], ids: readonly string[], enabled: boolean) {
  const changedIds = new Set(ids);
  return agents.map((agent) => changedIds.has(agent.id) ? { ...agent, enabled } : agent);
}
