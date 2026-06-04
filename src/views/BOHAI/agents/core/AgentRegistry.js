import { AGENT_AGENT_CATEGORIES, resolveAgentCategory } from './agent-events.js';

const validateDefinition = (definition) => {
  if (!definition || typeof definition !== 'object') {
    throw new Error('AgentRegistry: definition 必须为对象');
  }
  if (!definition.name || typeof definition.name !== 'string') {
    throw new Error('AgentRegistry: 缺少 agent.name');
  }
  if (typeof definition.run !== 'function') {
    throw new Error(`AgentRegistry: agent(${definition.name}) 必须提供 run() 方法`);
  }
  if (definition.role && typeof definition.role !== 'string') {
    throw new Error('AgentRegistry: role 必须为字符串');
  }
  return true;
};

export const createAgentRegistry = ({ onChange } = {}) => {
  const agents = new Map();
  const aliases = new Map();
  const order = [];

  const emitChange = (event) => {
    if (typeof onChange === 'function') {
      try {
        onChange(event);
      } catch (_error) {
        // 注册表订阅者异常不影响核心流程
      }
    }
  };

  const register = (definition) => {
    validateDefinition(definition);
    const name = String(definition.name).trim();
    const role = definition.role || name;
    const enriched = {
      ...definition,
      name,
      role,
      category: definition.category || resolveAgentCategory(role),
      timeoutMs: Number.isFinite(definition.timeoutMs) ? Number(definition.timeoutMs) : 25000,
      enabled: definition.enabled !== false
    };
    agents.set(name, enriched);
    if (name !== role) aliases.set(role, name);
    if (!order.includes(name)) order.push(name);
    emitChange({ type: 'register', name });
    return enriched;
  };

  const unregister = (name) => {
    const safeName = String(name || '').trim();
    if (!agents.has(safeName)) return false;
    agents.delete(safeName);
    const index = order.indexOf(safeName);
    if (index >= 0) order.splice(index, 1);
    Array.from(aliases.entries()).forEach(([alias, target]) => {
      if (target === safeName) aliases.delete(alias);
    });
    emitChange({ type: 'unregister', name: safeName });
    return true;
  };

  const get = (name) => {
    if (!name) return null;
    const direct = agents.get(name);
    if (direct) return direct;
    const resolved = aliases.get(name);
    if (resolved) return agents.get(resolved) || null;
    return null;
  };

  const has = (name) => Boolean(get(name));

  const list = () => order.map((name) => agents.get(name)).filter(Boolean);

  const listByCategory = (category) => list().filter((agent) => agent.category === category);

  const findByPredicate = (predicate) => {
    if (typeof predicate !== 'function') return null;
    return list().find((agent) => predicate(agent)) || null;
  };

  return {
    register,
    unregister,
    get,
    has,
    list,
    listByCategory,
    findByPredicate,
    size: () => agents.size,
    CATEGORIES: AGENT_AGENT_CATEGORIES
  };
};
