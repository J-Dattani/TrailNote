// ---------------- TrailNote Background Script ----------------

// Holds session data in memory
let currentSession = [];
let isTracking = false;
let currentMode = null; // "browsing" or "research"

// 🟢 Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startTracking") {
    currentMode = msg.mode;
    isTracking = true;
    currentSession = [];
    chrome.storage.local.set({ trailnote_tracking: true, trailnote_mode: currentMode });
    sendResponse({ started: true });
  }

  if (msg.action === "stopTracking") {
    isTracking = false;
    chrome.storage.local.set({ trailnote_tracking: false });
    // Save current session to history when stopping
    if (currentSession && currentSession.length) {
      chrome.storage.local.get({ trailnote_sessions: [] }, data => {
        const sessions = data.trailnote_sessions || [];
        sessions.unshift({ logs: [...currentSession], mode: currentMode, timestamp: new Date().toLocaleString() });
        if (sessions.length > 5) sessions.pop();
        chrome.storage.local.set({ trailnote_sessions: sessions });
      });
      currentSession = [];
    }
    sendResponse({ stopped: true });
  }

  // PDF generation is now handled in popup.js

  // ---------------- Context menu (right-click) quick-add ----------------
  function ensureContextMenus() {
    // remove and recreate to avoid duplicates and ensure presence
    try {
      chrome.contextMenus.removeAll(() => {
        try {
          chrome.contextMenus.create({
            id: 'trailnote-add-browsing',
            title: 'TrailNote: Add selection to Browsing',
            contexts: ['selection']
          });
          chrome.contextMenus.create({
            id: 'trailnote-add-research',
            title: 'TrailNote: Add selection to Research',
            contexts: ['selection']
          });
          console.info('TrailNote: context menus created');
        } catch (e) {
          console.warn('TrailNote: could not create context menus', e);
        }
      });
    } catch (e) {
      console.warn('TrailNote: error ensuring context menus', e);
    }
  }

  // Create context menus on install and startup, and attempt on service worker load
  chrome.runtime.onInstalled.addListener(() => ensureContextMenus());
  chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(() => ensureContextMenus());
  // attempt once on service worker start as well
  try { setTimeout(ensureContextMenus, 300); } catch (e) {}

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
      if (!info || !info.selectionText) return;
      const trimmed = info.selectionText.trim();
      if (!trimmed) return;

      // Determine mode by menu item id
      let modeForEntry = 'browsing';
      if (info.menuItemId === 'trailnote-add-research') modeForEntry = 'research';

      // Build a simple record from the selection
      const record = {
        title: tab?.title || 'No Title',
        url: tab?.url || '',
        time: new Date().toLocaleTimeString(),
        summary: trimmed.slice(0, 1000), // limit length
        keywords: [],
        // mark it as userAdded so UI can flag it
        userAdded: true
      };

      // If the user-selected research mode, set currentMode accordingly
      if (modeForEntry === 'research') {
        currentMode = 'research';
      }

      // Prepend to current session even if tracking isn't active — we treat quick-add as implicit tracking
      // Deduplicate quick-add similar to automated captures
      try {
        const last = currentSession && currentSession.length ? currentSession[0] : null;
        if (!last || last.url !== record.url || last.title !== record.title) {
          currentSession.unshift(record);
          if (currentSession.length > 5) currentSession.pop();
        }
      } catch (e) {
        currentSession.unshift(record);
        if (currentSession.length > 5) currentSession.pop();
      }

      // Persist immediately
      chrome.storage.local.set({ trailnote_logs: currentSession, trailnote_tracking: true, trailnote_mode: currentMode });

      // Notify popup/UI
      try { chrome.runtime.sendMessage({ action: 'updateLog', data: currentSession }); } catch (e) {}
    } catch (e) {
      console.warn('TrailNote: error handling context menu click', e);
    }
  });
});

// 🧩 Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isTracking || !tab.url || changeInfo.status !== "complete") return;
  // Only attempt extraction on http(s) or file URLs. Skip chrome://, edge://, about:, extension pages, PDFs, etc.
  try {
    const urlLower = (tab.url || '').toLowerCase();
    // Only track standard web pages. Skip blob:, chrome:, extension pages, file downloads, etc.
    if (!(urlLower.startsWith('http://') || urlLower.startsWith('https://'))) {
      // skip unsupported schemes
      return;
    }
  } catch (e) {
    return;
  }

  // Request advanced summary and keywords from content.js
  let summary = 'Summary not available';
  let keywords = [];
  // make `result` available outside the try block
  let result = null;
  // Track noisy tab errors to avoid spamming the console
  const _recentTabErrors = new Map(); // tabId -> {msg:timestamp}
  try {
    result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'extractSummary' }, (response) => {
        if (chrome.runtime.lastError) {
          // content script may not be injected or the tab may block it
          const msg = chrome.runtime.lastError.message || '';
          const prev = _recentTabErrors.get(tabId) || '';
          // only log if message changed since last time for this tab
          if (prev !== msg) {
            console.warn('TrailNote: sendMessage failed for tab', tabId, msg);
            _recentTabErrors.set(tabId, msg);
            // clear after some time
            setTimeout(() => { if (_recentTabErrors.get(tabId) === msg) _recentTabErrors.delete(tabId); }, 10000);
          }
          return resolve(null);
        }
        resolve(response);
      });
    });

    // If sendMessage returned null (no content script), try to inject content.js dynamically
    if (!result) {
      try {
        console.info('TrailNote: attempting to inject content script into tab', tabId);
        // Attempt to inject the content script into the tab (requires 'scripting' permission)
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  // give the script a short moment to initialize
  await new Promise(r => setTimeout(r, 500));
        // retry messaging once
        try {
          result = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'extractSummary' }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('TrailNote: resend sendMessage failed for tab', tabId, chrome.runtime.lastError.message);
                return resolve(null);
              }
              resolve(response);
            });
          });
        } catch (e) {
          console.warn('TrailNote: unexpected error during resend sendMessage', e);
          result = null;
        }
      } catch (injectErr) {
        console.warn('TrailNote: failed to inject content script', injectErr);
        result = null;
      }
    }

    if (result) {
      summary = result.summary || summary;
      keywords = result.keywords || [];
    }
  } catch (e) {
    console.warn('TrailNote: error while requesting summary from content script', e);
    result = null;
  }

  // If the content script marked this page as an interstitial or otherwise to be skipped,
  // don't record it in the session. This prevents captures like "Just a moment..." pages.
  try {
    if (result && result.skip) {
      console.info('TrailNote: content script requested skip for tab', tabId, tab.url);
      return; // abort adding this record
    }
  } catch (e) {
    // ignore skip-check errors and continue
  }

  const record = {
    title: tab.title,
    url: tab.url,
    time: new Date().toLocaleTimeString(),
    summary: summary,
    keywords: keywords
  };

  // If content script provided extra fields, include them
  try {
    if (result && typeof result === 'object') {
      if (result.headings) record.headings = result.headings;
      if (result.bullets) record.bullets = result.bullets;
      if (result.author) record.author = result.author;
      if (result.publishDate) record.publishDate = result.publishDate;
      if (result.abstract) record.abstract = result.abstract;
    }
  } catch (e) {
    // ignore field-attaching errors
  }

  // keep only 5 recent
  // Deduplicate: avoid inserting the same URL+title if it was the last captured item
  try {
    const last = currentSession && currentSession.length ? currentSession[0] : null;
    if (!last || last.url !== record.url || last.title !== record.title) {
      currentSession.unshift(record);
      if (currentSession.length > 5) currentSession.pop();
      // store in local storage
      chrome.storage.local.set({ trailnote_logs: currentSession });
    } else {
      // duplicate of most recent — skip inserting but still persist (no-op)
      chrome.storage.local.set({ trailnote_logs: currentSession });
    }
  } catch (e) {
    // fallback to simple push if something unexpected happens
    currentSession.unshift(record);
    if (currentSession.length > 5) currentSession.pop();
    chrome.storage.local.set({ trailnote_logs: currentSession });
  }

  // update popup if open (safe)
  try {
    chrome.runtime.sendMessage({ action: "updateLog", data: currentSession });
  } catch (e) {
    // no popup open — ignore
  }
});

// PDF generation removed from background.js
