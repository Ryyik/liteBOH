<template>
    <section class="model-routing-shell">
        <header class="model-routing-header">
            <div>
                <h2>模型路由</h2>
                <p>查看每个模型最终会走哪一条 API Key，便于排查"模型 X 实际用的是 Key Y"的问题。</p>
            </div>
            <div class="model-routing-header-actions">
                <span v-if="lastUpdatedAt" class="model-routing-updated">
                    更新于 {{ formatTime(lastUpdatedAt) }}
                </span>
                <button type="button" class="ghost-btn" @click="loadAll" :disabled="isLoading">
                    <RefreshCw :size="16" :class="{ spinning: isLoading }" />
                    <span>重新查询</span>
                </button>
            </div>
        </header>

        <p v-if="errorMessage" class="model-routing-error">{{ errorMessage }}</p>

        <div v-for="group in groups" :key="group.category" class="model-group">
            <div class="model-group-header">
                <component :is="group.icon" :size="18" />
                <div>
                    <strong>{{ group.category }}</strong>
                    <span class="model-group-purpose">用途: {{ group.purpose }}</span>
                </div>
            </div>

            <div class="model-table-wrapper">
                <table class="model-table">
                    <thead>
                        <tr>
                            <th>模型</th>
                            <th>Provider</th>
                            <th>命中 Key</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="model in group.models" :key="model.id">
                            <td>
                                <div class="model-cell">
                                    <strong>{{ model.name }}</strong>
                                    <code>{{ model.id }}</code>
                                </div>
                            </td>
                            <td>
                                <span class="provider-pill" :class="['provider-' + (model.providerKey || 'unknown')]">
                                    {{ model.provider }}
                                </span>
                            </td>
                            <td>
                                <KeyRoutingCell
                                    :key-info="resolveKeyFor(model)"
                                    :loading="isResolving(model.providerKey, group.purpose)"
                                />
                            </td>
                            <td>
                                <KeyStatusBadge :key-info="resolveKeyFor(model)" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue';
import { RefreshCw, MessageSquare, Layers, AudioLines, Image as ImageIcon, ScanSearch, KeyRound, CheckCircle2, AlertTriangle, XCircle, LoaderCircle } from 'lucide-vue-next';
import { resolveVaultActiveKey } from '@/utils/api/api-key-runtime-api.js';
import { availableModels, siliconModelCatalog } from '@/views/BOHAI/composables/chat-engine-config.js';

const ROLE_TO_PURPOSE = {
    'free-chat': 'chat',
    'zhipu-chat': 'chat',
    chat: 'chat',
    'rag-embedding': 'embedding',
    'rag-embedding-alt': 'embedding',
    'rag-rerank': 'rerank',
    'rag-rerank-alt': 'rerank',
    ocr: 'multimodal',
    'ocr-vl': 'multimodal',
    'speech-to-text': 'multimodal',
    'image-generation': 'multimodal'
};

const isLoading = ref(false);
const errorMessage = ref('');
const lastUpdatedAt = ref('');
const resolvingKeys = ref(new Set());
const keyMap = ref({}); // key: `${provider}:${purpose}` -> keyInfo

const KeyRoutingCell = {
    props: ['keyInfo', 'loading'],
    render() {
        if (this.loading) {
            return h('div', { class: 'key-cell key-cell-loading' }, [
                h(LoaderCircle, { size: 14, class: 'spinning' }),
                h('span', '查询中…')
            ]);
        }
        if (!this.keyInfo) {
            return h('div', { class: 'key-cell key-cell-empty' }, [
                h(XCircle, { size: 14 }),
                h('span', '未配置')
            ]);
        }
        const children = [
            h(KeyRound, { size: 14 }),
            h('strong', this.keyInfo.label || `${this.keyInfo.provider} ${this.keyInfo.purpose}`),
            this.keyInfo.maskedValue
                ? h('code', this.keyInfo.maskedValue)
                : null
        ];
        return h('div', { class: 'key-cell' }, children);
    }
};

const KeyStatusBadge = {
    props: ['keyInfo'],
    render() {
        if (!this.keyInfo) return h('span', { class: 'status-badge status-muted' }, '未配置');
        if (this.keyInfo.source === 'server_secret_fallback' || this.keyInfo.readonly) {
            return h('span', { class: 'status-badge status-fallback' }, [
                h(AlertTriangle, { size: 12 }),
                h('span', 'Secrets 兜底')
            ]);
        }
        return h('span', { class: 'status-badge status-active' }, [
            h(CheckCircle2, { size: 12 }),
            h('span', 'Vault 命中')
        ]);
    }
};

const buildGroups = () => {
    const buildGroup = (category, purpose, icon, items) => items
        .filter((m) => m?.id)
        .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            provider: m.provider || (m.providerKey === 'zhipu' ? 'ZhipuAI' : 'SiliconCloud'),
            providerKey: m.providerKey || 'siliconflow',
            purpose
        }));

    return [
        {
            category: '对话模型 (Chat)',
            purpose: 'chat',
            icon: MessageSquare,
            models: buildGroup('chat', 'chat', MessageSquare, availableModels || [])
        },
        {
            category: '向量嵌入 (Embedding)',
            purpose: 'embedding',
            icon: Layers,
            models: buildGroup('embedding', 'embedding', Layers, siliconModelCatalog?.embedding || [])
        },
        {
            category: '语义重排 (Rerank)',
            purpose: 'rerank',
            icon: ScanSearch,
            models: buildGroup('rerank', 'rerank', ScanSearch, siliconModelCatalog?.rerank || [])
        },
        {
            category: '多模态 (OCR / ASR / 生图)',
            purpose: 'multimodal',
            icon: ImageIcon,
            models: buildGroup('multimodal', 'multimodal', ImageIcon, siliconModelCatalog?.multimodal || [])
        }
    ].filter((g) => g.models.length > 0);
};

const groups = computed(() => buildGroups());

const isResolving = (provider, purpose) => resolvingKeys.value.has(`${provider}:${purpose}`);

const resolveKeyFor = (model) => keyMap.value[`${model.providerKey}:${model.purpose}`] || null;

const formatTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
};

const loadAll = async () => {
    isLoading.value = true;
    errorMessage.value = '';
    const uniquePairs = new Map();
    groups.value.forEach((group) => {
        group.models.forEach((model) => {
            const pair = `${model.providerKey}:${model.purpose}`;
            if (!uniquePairs.has(pair)) {
                uniquePairs.set(pair, { provider: model.providerKey, purpose: model.purpose });
            }
        });
    });

    const pending = Array.from(uniquePairs.values());
    pending.forEach((p) => resolvingKeys.value.add(`${p.provider}:${p.purpose}`));
    // 触发响应式
    resolvingKeys.value = new Set(resolvingKeys.value);

    try {
        const results = await Promise.all(
            pending.map(async (p) => {
                const r = await resolveVaultActiveKey({ provider: p.provider, purpose: p.purpose });
                return { key: `${p.provider}:${p.purpose}`, result: r };
            })
        );
        const next = { ...keyMap.value };
        for (const { key, result } of results) {
            if (result.ok) {
                next[key] = result.data?.keyInfo || null;
            } else {
                next[key] = null;
            }
        }
        keyMap.value = next;
        lastUpdatedAt.value = new Date().toISOString();
        const failed = results.filter((r) => !r.result.ok);
        if (failed.length) {
            errorMessage.value = `部分 provider 解析失败：${failed.map((f) => f.key).join(', ')}`;
        }
    } catch (err) {
        errorMessage.value = err?.message || '查询模型路由时出错';
    } finally {
        resolvingKeys.value = new Set();
        isLoading.value = false;
    }
};

onMounted(() => {
    loadAll();
});
</script>

<style scoped>
.model-routing-shell {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px 0 48px;
}

.model-routing-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.model-routing-header h2 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
}

.model-routing-header p {
    margin: 0;
    font-size: 13px;
    color: #64748b;
    max-width: 720px;
}

.model-routing-header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
}

.model-routing-updated {
    font-size: 12px;
    color: #64748b;
}

.model-routing-error {
    margin: 0;
    padding: 10px 14px;
    border-radius: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    font-size: 13px;
}

.model-group {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    overflow: hidden;
}

.model-group-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: linear-gradient(120deg, #f1f5f9, #f8fafc);
    border-bottom: 1px solid #e2e8f0;
}

.model-group-header strong {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
}

.model-group-purpose {
    font-size: 12px;
    color: #64748b;
}

.model-table-wrapper {
    overflow-x: auto;
}

.model-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: #1f2937;
}

.model-table th,
.model-table td {
    padding: 12px 18px;
    text-align: left;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
}

.model-table th {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
    background: #f8fafc;
}

.model-table tr:last-child td {
    border-bottom: none;
}

.model-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.model-cell strong {
    font-size: 13px;
    color: #0f172a;
}

.model-cell code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    color: #475569;
    word-break: break-all;
}

.provider-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: #e0f2fe;
    color: #0369a1;
}

.provider-pill.provider-zhipu {
    background: #fef3c7;
    color: #b45309;
}

.provider-pill.provider-siliconflow {
    background: #ede9fe;
    color: #6d28d9;
}

.key-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
    color: #0f172a;
}

.key-cell strong {
    font-size: 13px;
}

.key-cell code {
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(37, 99, 235, 0.08);
    color: #1d4ed8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
}

.key-cell-empty {
    color: #94a3b8;
    font-style: italic;
}

.key-cell-loading {
    color: #64748b;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
}

.status-active {
    background: rgba(22, 163, 74, 0.12);
    color: #15803d;
}

.status-fallback {
    background: rgba(245, 158, 11, 0.14);
    color: #b45309;
}

.status-muted {
    background: #f1f5f9;
    color: #64748b;
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 720px) {
    .model-routing-header {
        flex-direction: column;
        align-items: flex-start;
    }
    .model-routing-header-actions {
        align-self: flex-end;
    }
    .model-table th,
    .model-table td {
        padding: 10px 12px;
    }
}
</style>
