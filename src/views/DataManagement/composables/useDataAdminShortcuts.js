/**
 * DataAdmin 全局快捷键中心（plans/027 4.5 扩展：`?` 帮助浮层 / J K 行移动）
 *
 * 约定：
 *  - 输入态（INPUT/TEXTAREA/SELECT）不触发单键快捷键；
 *  - Esc 的关闭顺序：快捷键帮助浮层 → 编辑抽屉/用户选择弹窗；
 *  - `?` 与 J/K 只在非弹窗态生效。
 */
export const createShortcutsCenter = ({
  showModalRef,
  isSavingRef,
  isEditingRef,
  canCreateCurrentTabRef,
  activeAdminSectionRef,
  editDrawerNavRef,
  shortcutHelpRef,
  saveData,
  closeModal,
  openEditModal,
  navigateEditRecord,
}) => {
  const handleGlobalShortcuts = (e) => {
    const tag = e.target.tagName;
    const isTypingInField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Ctrl+S / Cmd+S → save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (showModalRef.value && !isSavingRef.value) {
        saveData();
      }
      return;
    }

    // Escape → 先关快捷键帮助浮层，再关抽屉 / 用户选择弹窗
    if (e.key === 'Escape' && !isTypingInField) {
      if (shortcutHelpRef?.value) {
        shortcutHelpRef.value = false;
        return;
      }
      if (showModalRef.value) {
        closeModal();
      }
      return;
    }

    // / → focus global search
    if (e.key === '/' && !isTypingInField) {
      e.preventDefault();
      const searchInput = document.querySelector('.search-box input');
      if (searchInput) searchInput.focus();
      return;
    }

    // ? → 快捷键帮助浮层（plans/027 4.5）
    if (e.key === '?' && !isTypingInField && !showModalRef.value) {
      e.preventDefault();
      if (shortcutHelpRef) shortcutHelpRef.value = !shortcutHelpRef.value;
      return;
    }

    // j / k → 上下移动行：聚焦上/下一行的勾选框并滚到可视区（表格视图；
    // 聚焦后空格即勾选）。与「?」帮助表内容保持一致，别只改一边。
    if (
      (e.key === 'j' || e.key === 'k') &&
      !isTypingInField &&
      !e.ctrlKey &&
      !e.metaKey &&
      !showModalRef.value
    ) {
      const rowChecks = Array.from(
        document.querySelectorAll('.g-table-sheet tbody input[type="checkbox"]'),
      );
      if (rowChecks.length) {
        const current = rowChecks.indexOf(document.activeElement);
        const nextIndex =
          current < 0
            ? 0
            : e.key === 'j'
              ? Math.min(current + 1, rowChecks.length - 1)
              : Math.max(current - 1, 0);
        const target = rowChecks[nextIndex];
        if (target) {
          target.focus();
          target.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }

    // n → new record (when not editing)
    if (e.key === 'n' && !isTypingInField && !e.ctrlKey && !e.metaKey) {
      if (canCreateCurrentTabRef.value && activeAdminSectionRef.value === 'data') {
        openEditModal();
      }
      return;
    }

    // ← / → → navigate records in drawer
    if (showModalRef.value && isEditingRef.value) {
      if (e.key === 'ArrowLeft' && editDrawerNavRef.value.hasPrev) {
        e.preventDefault();
        navigateEditRecord(-1);
        return;
      }
      if (e.key === 'ArrowRight' && editDrawerNavRef.value.hasNext) {
        e.preventDefault();
        navigateEditRecord(1);
        return;
      }
    }
  };

  return { handleGlobalShortcuts };
};
