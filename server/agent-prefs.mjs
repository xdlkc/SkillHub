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

export class AgentPreferenceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AgentPreferenceError';
    this.status = status;
  }
}

function parseBulkPreferenceRequest(body, supportedAgents) {
  if (!body || typeof body !== 'object') {
    throw new AgentPreferenceError(400, '请求体必须是对象');
  }
  if (!Array.isArray(body.agents) || body.agents.length === 0) {
    throw new AgentPreferenceError(400, 'agents 必须是非空数组');
  }
  if (body.agents.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new AgentPreferenceError(400, 'agents 必须只包含 Agent ID');
  }
  if (typeof body.enabled !== 'boolean') {
    throw new AgentPreferenceError(400, 'enabled 必须是布尔值');
  }

  const agentIds = [...new Set(body.agents)];
  const supportedIds = new Set(supportedAgents.map((agent) => agent.id));
  const unknownIds = agentIds.filter((id) => !supportedIds.has(id));
  if (unknownIds.length > 0) {
    throw new AgentPreferenceError(404, `未知 agent: ${unknownIds.join(', ')}`);
  }

  return { agents: agentIds, enabled: body.enabled };
}

function writeAgentPreferences(db, agentIds, enabled) {
  const statement = db.prepare(
    `INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)
     ON CONFLICT(agent) DO UPDATE SET enabled = excluded.enabled`
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const id of agentIds) statement.run(id, enabled ? 1 : 0);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      const errors = [error, rollbackError];
      try {
        db.close();
      } catch (closeError) {
        errors.push(closeError);
      }
      throw new AggregateError(errors, 'Agent preference transaction rollback failed');
    }
    throw error;
  }
}

export function updateAgentPreferences(db, body, supportedAgents) {
  const request = parseBulkPreferenceRequest(body, supportedAgents);
  writeAgentPreferences(db, request.agents, request.enabled);
  return {
    agents: request.agents,
    enabled: request.enabled,
    updated: request.agents.length,
  };
}
