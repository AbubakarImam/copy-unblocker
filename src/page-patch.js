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
})();
