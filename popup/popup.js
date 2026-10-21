// popup.js runs the little window that opens when you click the toolbar icon.
// It reads and saves the on/off settings. content.js on the page notices the
// change by itself, so there's no need to reload.
const siteToggle = document.getElementById("siteToggle");
const allToggle = document.getElementById("allToggle");
const hostLabel = document.getElementById("host");
const note = document.getElementById("note");

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let host = "";
  try {
    const url = new URL(tab.url);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
      host = url.hostname;
    }
  } catch (_) {}

  const { allSites, sites } = await chrome.storage.sync.get({ allSites: false, sites: {} });
  allToggle.checked = allSites;

  if (!host && !(tab.url || "").startsWith("file:")) {
    hostLabel.textContent = "This page can't be changed";
    note.textContent = "Chrome doesn't let extensions run on its own pages (like chrome:// or the Web Store).";
    siteToggle.disabled = true;
  } else {
    hostLabel.textContent = host || "Local file";
    siteToggle.checked = Boolean(sites[host]);
  }

  siteToggle.addEventListener("change", async () => {
    const current = (await chrome.storage.sync.get({ sites: {} })).sites;
    if (siteToggle.checked) current[host] = true;
    else delete current[host];
    await chrome.storage.sync.set({ sites: current });
  });

  allToggle.addEventListener("change", async () => {
    await chrome.storage.sync.set({ allSites: allToggle.checked });
  });
}

main();
