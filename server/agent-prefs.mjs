export const DEFAULT_ENABLED_AGENT_IDS = new Set(['claude-code', 'codex']);

export function getAgentsWithPreferences(db, agents) {
  const preferences = new Map(
    db.prepare('SELECT agent, enabled FROM agent_prefs').all()
      .map((row) => [row.agent, Boolean(row.enabled)])
  );

  return agents.map((agent) => ({
    ...agent,
    enabled: preferences.has(agent.id)
      ? preferences.get(agent.id)
      : DEFAULT_ENABLED_AGENT_IDS.has(agent.id),
  }));
}

export function enabledInstalledAgentIds(db, agents) {
  return getAgentsWithPreferences(db, agents)
    .filter((agent) => agent.installed && agent.enabled)
    .map((agent) => agent.id);
}
