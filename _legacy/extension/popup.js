async function getSettings() {
  return await chrome.storage.sync.get({
    targetLang: "KO",
  });
}

async function setSettings(patch) {
  await chrome.storage.sync.set(patch);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function renderToggleState(inputEl, stateEl, checked) {
  inputEl.checked = Boolean(checked);
  stateEl.textContent = inputEl.checked ? "ON" : "OFF";
}

function renderYouTubeSupport(toggleEl, hintEl, supported) {
  toggleEl.disabled = !supported;
  hintEl.textContent = supported
    ? "Desktop watch page only."
    : "Available on youtube.com/watch only.";
}

function isYouTubeWatchUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    const host = String(url.hostname || "").toLowerCase();
    const isYouTubeHost = host === "www.youtube.com" || host === "youtube.com";
    return isYouTubeHost && url.pathname.startsWith("/watch");
  } catch {
    return false;
  }
}

async function queryPageState(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "DUALREAD_GET_PAGE_STATE" });
  } catch {
    return null;
  }
}

async function queryYouTubeSubtitleState(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "DUALREAD_GET_YT_SUBTITLE_STATE" });
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  const target = document.getElementById("target");
  const pageToggle = document.getElementById("toggle");
  const pageToggleState = document.getElementById("toggleState");
  const ytToggle = document.getElementById("ytToggle");
  const ytToggleState = document.getElementById("ytToggleState");
  const ytSupportHint = document.getElementById("ytSupportHint");

  const syncFromActiveTab = async () => {
    const tab = await getActiveTab();
    const tabId = tab?.id;
    const supportedByUrl = isYouTubeWatchUrl(tab?.url);

    if (!tabId) {
      renderToggleState(pageToggle, pageToggleState, false);
      renderToggleState(ytToggle, ytToggleState, false);
      renderYouTubeSupport(ytToggle, ytSupportHint, false);
      return;
    }

    const pageState = await queryPageState(tabId);
    renderToggleState(pageToggle, pageToggleState, Boolean(pageState?.ok && pageState?.enabled));

    if (!supportedByUrl) {
      renderToggleState(ytToggle, ytToggleState, false);
      renderYouTubeSupport(ytToggle, ytSupportHint, false);
      return;
    }

    const ytState = await queryYouTubeSubtitleState(tabId);
    const supported = ytState ? Boolean(ytState.supported) : true;
    renderYouTubeSupport(ytToggle, ytSupportHint, supported);
    renderToggleState(ytToggle, ytToggleState, Boolean(ytState?.ok && ytState?.enabled && supported));
  };

  await syncFromActiveTab();
  target.value = settings.targetLang;

  target.addEventListener("change", async () => {
    await setSettings({ targetLang: target.value });
  });

  pageToggle.addEventListener("change", async () => {
    const tab = await getActiveTab();
    const tabId = tab?.id;
    if (!tabId) {
      renderToggleState(pageToggle, pageToggleState, false);
      return;
    }

    try {
      await chrome.tabs.sendMessage(tabId, { type: "DUALREAD_TOGGLE_PAGE" });
      await syncFromActiveTab();
    } catch {
      renderToggleState(pageToggle, pageToggleState, !pageToggle.checked);
    }
  });

  ytToggle.addEventListener("change", async () => {
    const tab = await getActiveTab();
    const tabId = tab?.id;
    const supportedByUrl = isYouTubeWatchUrl(tab?.url);

    if (!tabId || !supportedByUrl) {
      renderToggleState(ytToggle, ytToggleState, false);
      renderYouTubeSupport(ytToggle, ytSupportHint, supportedByUrl);
      return;
    }

    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: "DUALREAD_TOGGLE_YT_SUBTITLE" });
      const supported = Boolean(resp?.supported);
      renderYouTubeSupport(ytToggle, ytSupportHint, supported);
      renderToggleState(ytToggle, ytToggleState, Boolean(resp?.ok && resp?.enabled && supported));
    } catch {
      renderToggleState(ytToggle, ytToggleState, !ytToggle.checked);
    }
  });

  document.getElementById("openOptions").addEventListener("click", async () => {
    chrome.runtime.openOptionsPage();
  });
});
