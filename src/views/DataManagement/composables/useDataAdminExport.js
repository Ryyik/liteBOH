import { ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { dataConfig, tabs } from '../config.js';
import { downloadBlob } from './useDataAdminHelpers.js';
import { buildCsvContent } from './csv-export.js';
import { logAdminAction } from '@/utils/api/admin-audit-api.js';

export const createExportCenter = ({
  currentTabRef,
  currentDataRef,
  visibleCurrentColumnsRef,
  userInfoRef,
  showToast,
  assertAdminAction,
  buildActionErrorMessage,
  addChangeLogEntry,
  fetchAllFilteredRows,
}) => {
  const isExportingBackup = ref(false);
  const isBackupExporting = ref(false);
  const isExportingAll = ref(false);
  const backupProgress = ref(0);
  const backupProgressText = ref('');
  let backupAbortController = null;
  let cancelBackupExport = null;

  // 统一回执：文件名带范围后缀，toast 报条数与范围（plans/027 S2）。
  const runExport = (rows, scope) => {
    const columns = visibleCurrentColumnsRef.value;
    const csvContent = buildCsvContent(rows, columns);
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const suffix = scope === 'all' ? '_all' : '';
    downloadBlob(
      blob,
      `${currentTabRef.value}${suffix}_${new Date().toISOString().split('T')[0]}.csv`,
    );
    const scopeText = scope === 'all' ? '全部筛选结果' : '当前页';
    showToast(`已导出 ${rows.length} 条（${scopeText}）`, 'success');
    addChangeLogEntry?.('export', null, { count: rows.length, scope, tab: currentTabRef.value });
    logAdminAction({
      action: 'export',
      // 审计的 resource_table 必须是真实表名；tab id（如 shopOrders）不是表
      table: dataConfig[currentTabRef.value]?.table || currentTabRef.value,
      meta: { count: rows.length, scope, tab: currentTabRef.value },
    });
  };

  const exportData = () => {
    runExport(currentDataRef.value || [], 'page');
  };

  const exportAllFiltered = async () => {
    if (isExportingAll.value) return;
    isExportingAll.value = true;
    try {
      assertAdminAction();
      const rows = await fetchAllFilteredRows();
      if (!rows.length) {
        showToast('当前筛选没有可导出的记录', 'warning');
        return;
      }
      runExport(rows, 'all');
    } catch (error) {
      logger.error('data-admin', '全量导出失败:', error);
      showToast('导出失败: ' + buildActionErrorMessage(error, '导出失败'), 'error');
    } finally {
      isExportingAll.value = false;
    }
  };

  const getBackupTableTargets = () => {
    const targets = new Map();
    tabs.forEach((tab) => {
      const table = dataConfig[tab.id]?.table;
      if (!table || targets.has(table)) return;
      targets.set(table, {
        table,
        sourceTabId: tab.id,
        sourceLabel: tab.label || tab.id,
        module: tab.module || 'data',
      });
    });
    return Array.from(targets.values());
  };

  const fetchBackupTableRows = async (target) => {
    const batchSize = 1000;
    const rows = [];
    let from = 0;
    let total = null;

    while (true) {
      const to = from + batchSize - 1;
      const { data, error, count } = await supabase
        .from(target.table)
        .select('*', { count: from === 0 ? 'exact' : undefined })
        .range(from, to);

      if (error) throw error;

      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (from === 0 && Number.isFinite(Number(count))) {
        total = Number(count);
      }
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    return {
      ...target,
      total: total ?? rows.length,
      exported: rows.length,
      rows,
    };
  };

  const exportBackupData = async () => {
    if (isExportingBackup.value) return;

    try {
      assertAdminAction();
      backupAbortController = new AbortController();
      isExportingBackup.value = true;
      isBackupExporting.value = true;
      backupProgress.value = 0;
      backupProgressText.value = '';
      cancelBackupExport = () => {
        backupAbortController?.abort();
        isBackupExporting.value = false;
        isExportingBackup.value = false;
      };
      const exportedAt = new Date().toISOString();
      const targets = getBackupTableTargets();
      const tablesPayload = {};
      const summary = [];
      let done = 0;
      const total = targets.length;

      for (const target of targets) {
        if (backupAbortController?.signal.aborted) {
          showToast('备份已取消', 'info');
          return;
        }
        backupProgress.value = Math.round((done / total) * 100);
        backupProgressText.value = `正在导出 ${target.sourceLabel}... (${done}/${total})`;
        const result = await fetchBackupTableRows(target);
        tablesPayload[result.table] = result.rows;
        summary.push({
          table: result.table,
          sourceTabId: result.sourceTabId,
          sourceLabel: result.sourceLabel,
          groupId: result.groupId,
          groupLabel: result.groupLabel,
          total: result.total,
          exported: result.exported,
        });
        done++;
      }

      const backupPayload = {
        type: 'boh-admin-data-backup',
        version: 1,
        exportedAt,
        exportedBy: {
          id: userInfoRef.value?.id || '',
          username: userInfoRef.value?.username || '',
          email: userInfoRef.value?.email || '',
          role: userInfoRef.value?.role || '',
        },
        summary,
        tables: tablesPayload,
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const timestamp = exportedAt.replace(/[:.]/g, '-');
      downloadBlob(blob, `boh-data-backup_${timestamp}.json`);
      showToast(`备份导出成功，共 ${summary.length} 张表`, 'success');

      addChangeLogEntry('backup_export', null, {
        tables: summary.map((s) => s.table),
        totalRows: summary.reduce((acc, s) => acc + (s.exported || 0), 0),
        note: '备份含 PII,请妥善保管',
      });
      // 备份审计：旧实现直插 admin_audit_log（单数表，一直在静默失败）——
      // 收口到 admin-audit-api（复数 admin_audit_logs，E2 迁移部署后生效）
      logAdminAction({
        action: 'export',
        table: 'backup',
        meta: {
          kind: 'backup',
          tables: summary.map((s) => s.table),
          totalRows: summary.reduce((acc, s) => acc + (s.exported || 0), 0),
        },
      });
    } catch (error) {
      logger.error('data-admin', '备份导出失败:', error);
      showToast('备份导出失败: ' + buildActionErrorMessage(error, '备份导出失败'), 'error');
    } finally {
      isBackupExporting.value = false;
      isExportingBackup.value = false;
      backupAbortController = null;
    }
  };

  const abortBackupExport = () => {
    if (backupAbortController) backupAbortController.abort();
  };

  return {
    isExportingBackup,
    isBackupExporting,
    isExportingAll,
    backupProgress,
    backupProgressText,
    cancelBackupExport,
    exportData,
    exportAllFiltered,
    exportBackupData,
    abortBackupExport,
  };
};
