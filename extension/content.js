// Solexity Content Script - Injected into all pages

console.log("✅ Solexity content script loaded");

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showSolexityNotification") {
    alert(message.text); // simple notification for now
  }
});

// Capture user-selected text and notify background to store
const sendSelection = () => {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0) {
    chrome.runtime.sendMessage({ action: "storeSelectedText", text: selection });
  }
};

document.addEventListener("mouseup", sendSelection);
document.addEventListener("keyup", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    // Optional hotkey: Ctrl/Cmd+B to send current selection
    sendSelection();
  }
});

// Notify background on scroll/activity to refresh screenshot throttled from background
let scrollTimeout;
window.addEventListener('scroll', () => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'pageActivity' });
  }, 250);
}, { passive: true });
