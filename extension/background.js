console.log("Hello from Solexity background.js");

// In-memory cache as quick relay; source of truth is chrome.storage
let latestSelectedText = '';
let latestCapturedImage = '';

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
    latestSelectedText = info.selectionText;
    await chrome.storage.local.set({ solexity_selectedText: latestSelectedText });
    chrome.action.openPopup && chrome.action.openPopup();
  }

  if (info.menuItemId === 'solexity-analyze-image') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
      latestCapturedImage = dataUrl;
      await chrome.storage.local.set({ solexity_capturedImage: latestCapturedImage });
      chrome.action.openPopup && chrome.action.openPopup();
    } catch (e) {
      console.error('Failed to capture tab:', e);
    }
  }
});

// Message routing between content and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'storeSelectedText' && typeof message.text === 'string') {
    latestSelectedText = message.text;
    chrome.storage.local.set({ solexity_selectedText: latestSelectedText });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
      .then((dataUrl) => {
        latestCapturedImage = dataUrl;
        chrome.storage.local.set({ solexity_capturedImage: latestCapturedImage });
        sendResponse({ ok: true, dataUrl });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e?.message || 'capture failed' });
      });
    return true; // async
  }
});