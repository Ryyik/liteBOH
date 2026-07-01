import { ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { dataConfig, tabs } from '../config.js';
import { TAB_SELECT_COLUMNS } from '../query-config.js';
import { downloadBlob } from './useDataAdminHelpers.js';

export const createExportCenter = ({
  currentTabRef,
  currentDataRef,
  visibleCurrentColumnsRef,
  userInfoRef,
  showToast,
  assertAdminAction,
  buildActionErrorMessage,
  addChangeLogEntry
}) => {
  const isExportingBackup = ref(false);
  const isBackupExporting = ref(false);
  const backupProgress = ref(0);
  const backupProgressText = ref('');
  let backupAbortController = null;
  let cancelBackupExport = null;

  const exportData = () => {
    const data = currentDataRef.value;
    const columns = visibleCurrentColumnsRef.value;

    const csvContent = [
      columns.map(col => col.label).join(','),
      ...data.map(item => columns.map(col => {
        let val = item[col.key];
        if (typeof val === 'object') val = JSON.stringify(val);
        let cellValue = String(val ?? '');
        // CSV 注入防护: 以 = + - @ 开头的值前缀单引号
        if (/^[=+\-@]/.test(cellValue)) cellValue = "'" + cellValue;
        return `"${cellValue.replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${currentTabRef.value}_${new Date().toISOString().split('T')[0]}.csv`);

    showToast('数据导出成功', 'success');
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
        module: tab.module || 'data'
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
      rows
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
          exported: result.exported
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
          role: userInfoRef.value?.role || ''
        },
        summary,
        tables: tablesPayload
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8;' });
      const timestamp = exportedAt.replace(/[:.]/g, '-');
      downloadBlob(blob, `boh-data-backup_${timestamp}.json`);
      showToast(`备份导出成功，共 ${summary.length} 张表`, 'success');

      addChangeLogEntry('backup_export', null, {
        tables: summary.map((s) => s.table),
        totalRows: summary.reduce((acc, s) => acc + (s.exported || 0), 0),
        note: '备份含 PII,请妥善保管'
      });
      try {
        await supabase.from('admin_audit_log').insert([{
          actor_id: userInfoRef.value?.id || null,
          action: 'backup_export',
          metadata: {
            tables: summary.map((s) => s.table),
            total_rows: summary.reduce((acc, s) => acc + (s.exported || 0), 0)
          }
        }]);
      } catch (auditErr) {
        logger.warn('data-admin', '备份审计写入失败(忽略):', auditErr);
      }
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
    backupProgress,
    backupProgressText,
    cancelBackupExport,
    exportData,
    exportBackupData,
    abortBackupExport
  };
};
