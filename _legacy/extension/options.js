async function load() {
  const settings = await chrome.storage.sync.get({
    proxyUrl: "http://localhost:8787",
    targetLang: "KO",
    sourceLang: "",
    cacheEnabled: false,
    extractionMode: "readability",
    visibleOnly: true,
    visibleRootMargin: "350px 0px 600px 0px",
    batchFlushMs: 120,
  });

  document.getElementById("proxyUrl").value = settings.proxyUrl;
  document.getElementById("targetLang").value = settings.targetLang;
  document.getElementById("sourceLang").value = settings.sourceLang;
  document.getElementById("cacheEnabled").checked = Boolean(settings.cacheEnabled);
  document.getElementById("extractionMode").value =
    settings.extractionMode === "legacy" ? "legacy" : "readability";
  document.getElementById("visibleOnly").checked = settings.visibleOnly !== false;
  document.getElementById("visibleRootMargin").value =
    (settings.visibleRootMargin || "350px 0px 600px 0px").trim();
  document.getElementById("batchFlushMs").value =
    Number.isFinite(Number(settings.batchFlushMs)) ? String(settings.batchFlushMs) : "120";
}

async function save() {
  const proxyUrl = document.getElementById("proxyUrl").value.trim();
  const targetLang = document.getElementById("targetLang").value;
  const sourceLang = document.getElementById("sourceLang").value;
  const cacheEnabled = document.getElementById("cacheEnabled").checked;
  const extractionMode = document.getElementById("extractionMode").value === "legacy"
    ? "legacy"
    : "readability";
  const visibleOnly = document.getElementById("visibleOnly").checked;
  const visibleRootMargin = document.getElementById("visibleRootMargin").value.trim() || "350px 0px 600px 0px";

  const rawFlush = Number(document.getElementById("batchFlushMs").value);
  const batchFlushMs = Number.isFinite(rawFlush)
    ? Math.min(1000, Math.max(20, Math.floor(rawFlush)))
    : 120;

  await chrome.storage.sync.set({
    proxyUrl,
    targetLang,
    sourceLang,
    cacheEnabled,
    extractionMode,
    visibleOnly,
    visibleRootMargin,
    batchFlushMs,
  });

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  status.className = "ok";
  setTimeout(() => (status.textContent = ""), 1000);
}

async function clearCache() {
  const el = document.getElementById("clearCacheStatus");
  el.textContent = "Clearing...";
  el.className = "hint";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "DUALREAD_CLEAR_CACHE" });
    if (!resp?.ok) {
      throw new Error(resp?.error?.message || "Failed to clear cache");
    }
    el.textContent = "Cache cleared.";
    el.className = "ok";
  } catch (e) {
    el.textContent = `Failed: ${e.message}`;
    el.className = "err";
  }
}

async function testProxy() {
  const { proxyUrl } = await chrome.storage.sync.get({ proxyUrl: "http://localhost:8787" });
  const el = document.getElementById("testResult");
  el.textContent = "Testing…";
  el.className = "hint";
  try {
    const resp = await fetch(`${proxyUrl.replace(/\/$/, "")}/health`);
    const txt = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    el.textContent = `OK: ${txt}`;
    el.className = "ok";
  } catch (e) {
    el.textContent = `Failed: ${e.message}`;
    el.className = "err";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("save").addEventListener("click", save);
  document.getElementById("clearCache").addEventListener("click", clearCache);
  document.getElementById("testProxy").addEventListener("click", testProxy);
});
