import { describe, expect, it } from 'vitest';
import {
  buildBohAIConnectorActionNote,
  createBohAIAction,
  createBohAIConnector,
  normalizeConnectorReadResult,
  runBohAIAction,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '../../src/utils/bohai-connectors.js';

describe('bohai connectors', () => {
  it('normalizes string connector results into evidence-bearing context', () => {
    const connector = createBohAIConnector({
      id: 'forum',
      planKey: 'forum',
      label: '社区帖子',
      source: '论坛'
    });

    const result = normalizeConnectorReadResult(connector, '【社区帖子检索结果】\n[F1] 论坛公告内容');

    expect(result.connectorId).toBe('forum');
    expect(result.context).toContain('[F1]');
    expect(result.total).toBe(1);
    expect(result.evidenceRefs).toEqual(['F1']);
  });

  it('runs only active connectors and summarizes their evidence', async () => {
    const connectors = [
      createBohAIConnector({
        id: 'forum',
        planKey: 'forum',
        label: '社区帖子',
        read: async () => '【社区帖子检索结果】\n[F1] A'
      }),
      createBohAIConnector({
        id: 'cloud',
        planKey: 'treehole',
        label: 'BOH Cloud+',
        read: async () => ({ context: '【用户 BOH Cloud+】\n[T1] B', total: 3, labels: ['Cloud'] })
      })
    ];

    const results = await runBohAIReadConnectors({
      connectors,
      plan: { forum: true, treehole: false },
      queryText: '最近论坛公告'
    });
    const summary = summarizeBohAIConnectorResults(results);

    expect(results).toHaveLength(1);
    expect(results[0].connectorId).toBe('forum');
    expect(summary.contextBlocks).toHaveLength(1);
    expect(summary.evidenceRefs).toEqual(['F1']);
    expect(summary.totalsById.forum).toBe(1);
  });

  it('builds readable action notes from connector metadata', () => {
    const connector = createBohAIConnector({
      id: 'cloud',
      planKey: 'treehole',
      label: 'BOH Cloud+',
      describeAction: (result) => `看了 Cloud+ ${result.total} 条`
    });

    const note = buildBohAIConnectorActionNote([
      {
        connector,
        connectorId: 'cloud',
        label: 'BOH Cloud+',
        context: '[T1] 内容',
        total: 2
      }
    ]);

    expect(note).toBe('看了 Cloud+ 2 条。');
  });

  it('does not describe failed connector reads as successful actions', () => {
    const connector = createBohAIConnector({
      id: 'cloud',
      planKey: 'treehole',
      label: 'BOH Cloud+',
      describeAction: () => '看了 Cloud+'
    });

    const note = buildBohAIConnectorActionNote([
      {
        ok: false,
        connector,
        connectorId: 'cloud',
        label: 'BOH Cloud+',
        context: '',
        total: 0,
        error: new Error('failed')
      }
    ]);

    expect(note).toBe('');
  });

  it('normalizes action login, validation, and execution results', async () => {
    const action = createBohAIAction({
      id: 'saveCloud',
      label: '保存到 BOH Cloud+',
      validate: (payload) => (
        payload?.content ? { ok: true } : { ok: false, error: { message: '保存内容不能为空。' } }
      ),
      execute: async (payload) => ({
        ok: true,
        message: '已保存',
        data: { content: payload.content }
      })
    });

    const loginRequired = await runBohAIAction({
      action,
      payload: { content: 'A' },
      auth: { isLoggedIn: false, userId: '' }
    });
    const invalid = await runBohAIAction({
      action,
      payload: { content: '' },
      auth: { isLoggedIn: true, userId: 'u1' }
    });
    const ok = await runBohAIAction({
      action,
      payload: { content: 'A' },
      auth: { isLoggedIn: true, userId: 'u1' }
    });

    expect(loginRequired.ok).toBe(false);
    expect(loginRequired.metadata.reason).toBe('login_required');
    expect(invalid.ok).toBe(false);
    expect(invalid.errorMessage).toBe('保存内容不能为空。');
    expect(ok.ok).toBe(true);
    expect(ok.message).toBe('已保存');
    expect(ok.data.content).toBe('A');
  });

  it('awaits async action validation before executing', async () => {
    let executed = false;
    const action = createBohAIAction({
      id: 'sendMail',
      label: '发送私信',
      validate: async () => ({ ok: false, error: { message: '异步校验失败' } }),
      execute: async () => {
        executed = true;
        return { ok: true, message: '不应执行' };
      }
    });

    const result = await runBohAIAction({
      action,
      payload: {},
      auth: { isLoggedIn: true, userId: 'u1' }
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('异步校验失败');
    expect(executed).toBe(false);
  });
});
