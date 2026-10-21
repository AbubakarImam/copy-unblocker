// background.js is the extension's "service worker": a small script Chrome runs
// in the background. Its only job is to show "ON" on the toolbar icon for tabs
// where the extension is active.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "status" || !sender.tab) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: message.on ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#1a7f37" });
});
