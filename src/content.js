// content.js runs in the extension's own private space on every page. It can
// read the extension's saved settings (chrome.storage), which page-patch.js
// can't. It decides whether this site is switched on, then:
//   - marks <html data-copy-unblocker="on"> so page-patch.js starts working
//   - adds CSS that makes all text selectable again
(() => {
  "use strict";

  const STYLE_ID = "copy-unblocker-style";
  const host = location.hostname;

  // CSS that undoes "user-select: none" and similar tricks.
  const CSS = `
    html[data-copy-unblocker="on"] *,
    html[data-copy-unblocker="on"] *::before,
    html[data-copy-unblocker="on"] *::after {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
    html[data-copy-unblocker="on"] ::selection {
      background: #338fff !important;
      color: #fff !important;
    }
  `;

  const addStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  };

  let wanted = false;

  const apply = (on) => {
    wanted = on;
    const root = document.documentElement;
    if (!root) return;
    if (on) {
      root.setAttribute("data-copy-unblocker", "on");
      addStyle();
    } else {
      root.removeAttribute("data-copy-unblocker");
    }
    // Only the top page reports to the toolbar badge, not every iframe.
    if (window === window.top) {
      chrome.runtime.sendMessage({ type: "status", on }).catch(() => {});
    }
  };

  // Settings look like: { allSites: false, sites: { "example.com": true } }
  const isEnabled = ({ allSites, sites }) => Boolean(allSites || (sites && sites[host]));

  const refresh = () =>
    chrome.storage.sync.get({ allSites: false, sites: {} }).then((settings) => {
      apply(isEnabled(settings));
    });

  refresh();

  // When you flip a switch in the popup, update straight away (no reload).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.allSites || changes.sites)) refresh();
  });

  // Some pages remove our <style> or the attribute later on. Put them back.
  new MutationObserver(() => {
    if (!wanted || !document.documentElement) return;
    if (!document.getElementById(STYLE_ID)) addStyle();
    if (document.documentElement.getAttribute("data-copy-unblocker") !== "on") {
      document.documentElement.setAttribute("data-copy-unblocker", "on");
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-copy-unblocker"] });
})();
