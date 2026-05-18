export async function runSyncFromSettings({
  sync,
  repository,
  state,
  render,
  renderSyncStatus,
  showToast,
  closeSettingsMenu,
} = {}) {
  closeSettingsMenu?.();

  const result = await sync.syncNow();
  renderSyncStatus?.(result);

  if (result.imported || result.action === "merged") {
    state.notes = await repository.list();
    render?.();
  }

  showToast?.(
    result.message || (result.ok ? "Synchronizacja zakończona." : "Synchronizacja nie powiodła się."),
  );

  return result;
}
