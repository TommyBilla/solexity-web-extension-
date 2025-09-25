console.log("Hello from Solexity background.js");

// In-memory cache as quick relay; source of truth is chrome.storage
const tabState = new Map(); // tabId -> { lastCapture: number }

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'solexity-summarize-selection',
        title: 'Solexity: Summarize selection',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'solexity-analyze-image',
        title: 'Solexity: Analyze current view',
        contexts: ['page'],
      });
    });
  } catch (e) {
    console.warn('Context menu setup failed:', e);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'solexity-summarize-selection' && info.selectionText) {
    if (tab && tab.id != null) {
      await chrome.storage.local.set({ [`solexity_selectedText_${tab.id}`]: info.selectionText });
    } else {
      await chrome.storage.local.set({ solexity_selectedText: info.selectionText });
    }
    chrome.action.openPopup && chrome.action.openPopup();
  }

  if (info.menuItemId === 'solexity-analyze-image') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
      if (tab && tab.id != null) {
        await chrome.storage.local.set({ [`solexity_capturedImage_${tab.id}`]: dataUrl });
      } else {
        await chrome.storage.local.set({ solexity_capturedImage: dataUrl });
      }
      chrome.action.openPopup && chrome.action.openPopup();
    } catch (e) {
      console.error('Failed to capture tab:', e);
    }
  }
});

// Message routing between content and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;
  if (message.action === 'storeSelectedText' && typeof message.text === 'string') {
    const key = tabId != null ? `solexity_selectedText_${tabId}` : 'solexity_selectedText';
    chrome.storage.local.set({ [key]: message.text });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'pageActivity') {
    if (tabId != null) {
      const now = Date.now();
      const s = tabState.get(tabId) || { lastCapture: 0 };
      if (now - s.lastCapture > 1500) {
        s.lastCapture = now;
        tabState.set(tabId, s);
        chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
          .then((dataUrl) => chrome.storage.local.set({ [`solexity_capturedImage_${tabId}`]: dataUrl }))
          .catch(() => {});
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
      .then(async (dataUrl) => {
        if (tabId != null) {
          await chrome.storage.local.set({ [`solexity_capturedImage_${tabId}`]: dataUrl });
        } else {
          await chrome.storage.local.set({ solexity_capturedImage: dataUrl });
        }
        sendResponse({ ok: true, dataUrl });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e?.message || 'capture failed' });
      });
    return true; // async
  }
});

// Refresh capture when active tab changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
    .then((dataUrl) => chrome.storage.local.set({ [`solexity_capturedImage_${tabId}`]: dataUrl }))
    .catch(() => {});
});