(function startLocalCloudFallback() {
  const GUEST_KEY = "study-tracker-online-guest-v1";
  const readOnly = Boolean(new URLSearchParams(location.search).get("view"));
  let activeUserId = null;

  function keyForActiveSpace() {
    return activeUserId ? `study-tracker-online-account-v1:${activeUserId}` : GUEST_KEY;
  }

  window.studyCloud = {
    isReadOnly: () => readOnly,
    setActiveUser(userId) {
      activeUserId = userId || null;
    },
    loadLocalState() {
      if (readOnly) return null;
      try {
        const saved = localStorage.getItem(keyForActiveSpace());
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    },
    saveLocalState(nextState) {
      if (readOnly) return true;
      localStorage.setItem(keyForActiveSpace(), JSON.stringify(nextState));
      return true;
    },
    queueSave(nextState) {
      // The Firebase module replaces this method after it loads.
    }
  };
})();
