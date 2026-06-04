const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeText = (value, maxChars = 120) => String(value || '').trim().slice(0, maxChars);

export const createBohAIRetrievalTrace = ({
  queryText = '',
  retrievalPlan = {},
  routingReasons = [],
  connectorResults = []
} = {}) => {
  const connectors = toArray(connectorResults).map((result) => {
    const connector = result?.connector || {};
    const evidenceRefs = toArray(result?.evidenceRefs)
      .map((ref) => String(ref || '').trim().toUpperCase())
      .filter(Boolean);
    return {
      connectorId: String(result?.connectorId || connector.id || '').trim(),
      label: String(result?.label || connector.label || '').trim(),
      source: String(result?.source || connector.source || connector.label || '').trim(),
      ok: result?.ok !== false,
      total: Number(result?.total || 0),
      confidence: Number.isFinite(Number(result?.confidence)) ? Number(result.confidence) : 0,
      evidenceRefs,
      contextChars: normalizeText(result?.context, 220).length,
      errorMessage: String(result?.error?.message || result?.error || '').trim()
    };
  });

  const evidenceRefs = [...new Set(connectors.flatMap((item) => item.evidenceRefs))];
  const activeConnectors = connectors.filter((item) => item.ok);

  return {
    queryText: normalizeText(queryText, 220),
    createdAt: Date.now(),
    retrievalPlan: {
      treehole: Boolean(retrievalPlan?.treehole),
      sharedMemory: Boolean(retrievalPlan?.sharedMemory),
      memory: Boolean(retrievalPlan?.memory),
      siteGuide: Boolean(retrievalPlan?.siteGuide),
      forum: Boolean(retrievalPlan?.forum),
      userPrivate: Boolean(retrievalPlan?.userPrivate)
    },
    routingReasons: toArray(routingReasons).map((item) => normalizeText(item, 120)).filter(Boolean).slice(0, 6),
    connectors,
    evidenceRefs,
    activeConnectorCount: activeConnectors.length,
    sourceCount: connectors.length
  };
};

export const formatBohAIRetrievalTraceSummary = (trace = {}) => {
  const parts = [];
  const plan = trace?.retrievalPlan || {};
  const connectors = toArray(trace?.connectors);

  if (plan.treehole) parts.push('Cloud+');
  if (plan.sharedMemory) parts.push('公共记忆');
  if (plan.memory) parts.push('记忆库');
  if (plan.siteGuide) parts.push('操作手册');
  if (plan.forum) parts.push('论坛');
  if (plan.userPrivate) parts.push('账号资料');

  const evidence = toArray(trace?.evidenceRefs).slice(0, 6);
  const success = connectors.filter((item) => item?.ok).length;
  const failure = connectors.filter((item) => item?.ok === false).length;
  const evidenceText = evidence.length > 0 ? `证据 ${evidence.join('、')}` : '无证据编号';

  if (parts.length === 0 && success === 0 && failure === 0) {
    return '';
  }

  const connectorText = [
    success > 0 ? `成功 ${success}` : '',
    failure > 0 ? `失败 ${failure}` : ''
  ].filter(Boolean).join('，');

  return [
    parts.length > 0 ? `检索源：${parts.join('、')}` : '',
    connectorText ? `状态：${connectorText}` : '',
    evidenceText
  ].filter(Boolean).join('；');
};
