// page-patch.js runs inside the web page itself (the "MAIN world"), so it can
// change the same JavaScript objects the page uses. It starts before any of the
// page's own scripts run.
//
// It only does something when content.js has switched the site on, which it
// does by putting data-copy-unblocker="on" on the <html> element.
(() => {
  "use strict";

  if (window.__copyUnblockerPatched) return;
  window.__copyUnblockerPatched = true;

  const isOn = () =>
    document.documentElement?.getAttribute("data-copy-unblocker") === "on";

  // Events that pages cancel to stop you selecting, copying, pasting or
  // right-clicking.
  const BLOCKABLE = new Set([
    "copy",
    "cut",
    "paste",
    "contextmenu",
    "selectstart",
    "dragstart",
  ]);

  const SHORTCUT_KEYS = new Set(["a", "c", "v", "x"]);

  // Should this event be protected from being cancelled?
  const isProtected = (event) => {
    if (!isOn()) return false;
    if (BLOCKABLE.has(event.type)) return true;
    // Ctrl/Cmd + A, C, V, X
    if (
      (event.type === "keydown" || event.type === "keyup" || event.type === "keypress") &&
      (event.ctrlKey || event.metaKey) &&
      SHORTCUT_KEYS.has(String(event.key).toLowerCase())
    ) {
      return true;
    }
    // Pasting into a text box
    if (event.type === "beforeinput" && event.inputType === "insertFromPaste") {
      return true;
    }
    return false;
  };

  // 1. event.preventDefault() is how a page says "don't do the normal thing".
  //    For protected events we turn it into a no-op, so the page's code still
  //    runs but the browser copies/pastes/opens the menu anyway.
  const originalPreventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (isProtected(this)) return;
    return originalPreventDefault.call(this);
  };

  // 2. The old-fashioned way to cancel: event.returnValue = false.
  const returnValueDesc = Object.getOwnPropertyDescriptor(Event.prototype, "returnValue");
  if (returnValueDesc && returnValueDesc.set) {
    Object.defineProperty(Event.prototype, "returnValue", {
      ...returnValueDesc,
      set(value) {
        if (value === false && isProtected(this)) return;
        returnValueDesc.set.call(this, value);
      },
    });
  }

  // 3. Handlers like oncopy="return false" or document.oncontextmenu = () => false
  //    cancel the event by returning false. Just before such an event reaches
  //    them, we wrap each one so its return value is thrown away.
  const wrapped = new WeakSet();
  const neutraliseInlineHandlers = (event) => {
    if (!isProtected(event)) return;
    const prop = "on" + event.type;
    for (const node of event.composedPath()) {
      const handler = node && node[prop];
      if (typeof handler !== "function" || wrapped.has(handler)) continue;
      const safe = function (e) {
        handler.call(this, e);
        // returning nothing means "don't cancel"
      };
      wrapped.add(safe);
      try {
        node[prop] = safe;
      } catch (_) {
        // some objects don't allow it; ignore
      }
    }
  };
  const ALL_TYPES = [...BLOCKABLE, "keydown", "keyup", "keypress", "beforeinput"];
  for (const type of ALL_TYPES) {
    // "capture: true" on window means we see the event before anything else.
    window.addEventListener(type, neutraliseInlineHandlers, true);
  }

  // 4. Some pages keep wiping out whatever you select. Ignore that while on.
  for (const name of ["removeAllRanges", "empty"]) {
    const original = Selection.prototype[name];
    if (typeof original !== "function") continue;
    Selection.prototype[name] = function () {
      if (isOn()) return;
      return original.apply(this, arguments);
    };
  }

  // 5. Math formulas (KaTeX, MathJax) and some SVGs/canvases aren't drawn as
  // plain text: they're many small positioned spans or vector paths, so a
  // normal copy grabs nothing or garbled symbols. But the real text is
  // usually still in the DOM somewhere, kept for screen readers:
  //   - KaTeX renders a hidden <math> (MathML) tree next to the visible one,
  //     including the original TeX source in an <annotation>.
  //   - MathJax (v3+) does the same with a hidden <mjx-assistive-mml>.
  //   - Well-authored SVGs carry <title>/<desc>/<text>; canvases sometimes
  //     carry aria-label/title.
  //   - <img> alt text is the author's own description of the picture.
  // When a copy happens, swap any of those elements inside the selection for
  // their real text before letting the browser write the clipboard. Plain
  // scanned/screenshotted text with none of the above has no recoverable
  // text anywhere in the page, so there's nothing we can do about that case.
  const extractMathText = (el) => {
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation?.textContent) return annotation.textContent;
    const mathml = el.querySelector("math");
    if (mathml?.textContent) return mathml.textContent;
    const assistive = el.querySelector("mjx-assistive-mml");
    if (assistive?.textContent) return assistive.textContent;
    return null;
  };

  const rewriteRichContent = (fragment) => {
    let changed = false;

    for (const el of fragment.querySelectorAll(".katex, mjx-container")) {
      const text = extractMathText(el);
      if (text == null) continue;
      el.replaceWith(document.createTextNode(` ${text} `));
      changed = true;
    }

    for (const img of fragment.querySelectorAll("img[alt]")) {
      if (!img.alt) continue;
      img.replaceWith(document.createTextNode(img.alt));
      changed = true;
    }

    for (const svg of fragment.querySelectorAll("svg")) {
      const label = svg.querySelector("title, desc")?.textContent?.trim();
      const text = label || [...svg.querySelectorAll("text")].map((t) => t.textContent).join("");
      if (!text.trim()) continue;
      svg.replaceWith(document.createTextNode(text));
      changed = true;
    }

    for (const canvas of fragment.querySelectorAll("canvas[aria-label], canvas[title]")) {
      const label = canvas.getAttribute("aria-label") || canvas.getAttribute("title");
      if (!label) continue;
      canvas.replaceWith(document.createTextNode(label));
      changed = true;
    }

    return changed ? fragment.textContent : null;
  };

  const serializeSelectionForCopy = (selection) => {
    if (!selection || selection.rangeCount === 0) return null;
    let changed = false;
    const parts = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      const fragment = selection.getRangeAt(i).cloneContents();
      const rewritten = rewriteRichContent(fragment);
      if (rewritten != null) changed = true;
      parts.push(rewritten ?? fragment.textContent);
    }
    return changed ? parts.join("") : null;
  };

  window.addEventListener(
    "copy",
    (event) => {
      if (!isOn() || !event.clipboardData) return;
      const text = serializeSelectionForCopy(window.getSelection());
      if (text == null) return;
      event.clipboardData.setData("text/plain", text);
      // Our own preventDefault() override (step 1) ignores calls on protected
      // events, so reach past it to the real one to make this substitution
      // stick instead of the browser's default (garbled) clipboard text.
      originalPreventDefault.call(event);
    },
    true,
  );
})();
