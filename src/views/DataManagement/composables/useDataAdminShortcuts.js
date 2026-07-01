export const createShortcutsCenter = ({
  showModalRef,
  isSavingRef,
  isEditingRef,
  canCreateCurrentTabRef,
  activeAdminSectionRef,
  editDrawerNavRef,
  saveData,
  closeModal,
  openEditModal,
  navigateEditRecord
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

    // Escape → close drawer / close user picker
    if (e.key === 'Escape' && !isTypingInField) {
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
