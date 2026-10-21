# Copy Unblocker

A Chrome extension that lets you **select (highlight), copy, cut, paste and right-click** on websites that try to stop you.

You switch it on per site from the toolbar icon, or turn it on for every site at once.

## Install it in Chrome (about 1 minute)

Chrome lets you load an extension straight from a folder on your computer. This is called loading it "unpacked".

1. **Get the files.** On this GitHub page click the green **Code** button, then **Download ZIP**. Unzip it somewhere you'll keep it (if you delete the folder, the extension stops working).
2. Open Chrome and go to `chrome://extensions` (type it in the address bar).
3. Turn on **Developer mode** with the switch in the top-right corner.
4. Click **Load unpacked** and choose the unzipped folder: the one that has `manifest.json` directly inside it.
5. "Copy Unblocker" now appears in the list. Click the puzzle-piece icon in Chrome's toolbar and click the pin next to Copy Unblocker so its icon is always visible.

## Use it

1. Go to a site that blocks copying.
2. Click the Copy Unblocker icon.
3. Turn on **On for this site**. It works straight away, no reload needed, and the icon shows a green **ON** badge.

Turn on **On for all sites** if you'd rather never think about it. It's off by default because a few sites (online editors such as Google Docs, games, drawing tools) use their own right-click menus and shortcuts, and the extension would get in their way.

> Chrome doesn't allow any extension on its own pages (`chrome://…`) or the Chrome Web Store. For PDF or HTML files opened from your computer, go to `chrome://extensions`, click **Details** under Copy Unblocker and switch on **Allow access to file URLs**.

After you change any of the code, go to `chrome://extensions` and click the circular **reload** arrow on the extension's card.

## How it works (in plain words)

When a browser does something like copy, paste or open the right-click menu, it first tells the web page "this is about to happen" by sending an **event**. The page's JavaScript can answer "no, cancel that" by calling `event.preventDefault()` or returning `false`. That is how most copy blocking works. The other common trick is a CSS rule, `user-select: none`, which makes text impossible to highlight.

The extension has three small scripts:

| File | Where it runs | What it does |
| --- | --- | --- |
| `src/page-patch.js` | Inside the web page, before the page's own scripts | Makes "cancel" do nothing for copy, cut, paste, right-click, text selection and Ctrl/Cmd+A/C/V/X. The page's code still runs, but its "no" is ignored. It also stops pages from wiping out your selection, and fixes up copying math formulas and labelled images (see below). |
| `src/content.js` | In the extension's private space on each page | Reads your settings, and when the site is switched on, marks the page and adds CSS that makes all text selectable again. |
| `src/background.js` | In the background | Shows the green **ON** badge on the icon. |

The popup (`popup/`) is the small window you see when you click the icon. It saves your choices with `chrome.storage.sync`, so they follow you to other computers signed in to the same Chrome profile.

If you know C#: an event here is a lot like a .NET event with a `CancelEventArgs` argument. Sites set `e.Cancel = true`, and this extension makes that setter do nothing.

`manifest.json` is the extension's settings file (a bit like a `.csproj`): it tells Chrome the extension's name, which scripts to run on which pages, and which permissions it needs. The only permission it asks for is `storage`, to remember your settings.

## Math formulas and images

Formulas drawn by **KaTeX** or **MathJax** aren't plain text on screen — they're lots of small positioned symbols, or vector paths — so a normal copy grabs nothing or garbled characters. Both libraries keep a hidden, screen-reader-only copy of the real formula in the page (KaTeX as MathML with the original TeX source attached; MathJax as `<mjx-assistive-mml>`). When you copy a selection that includes one of these, `page-patch.js` swaps it for that real text before the clipboard is written, so you get the TeX/MathML source instead of nonsense.

The same trick applies to `<img alt="…">` text, and to SVGs or canvases that carry a `<title>`, `<desc>`, `<text>`, or `aria-label`/`title` — if the author described the picture for accessibility, copying a selection over it now includes that description.

## What it can't get around

- A picture of text with **no alt text, title, or accessible description anywhere** — a plain scan or screenshot — has no text stored in the page at all, so there's nothing to recover. That would need OCR (reading the pixels and guessing the characters), which is a different kind of tool entirely.
- A **transparent layer** placed over the text can stop your mouse reaching it. You can usually still use Ctrl+A then Ctrl+C, or right-click > Inspect.
- Some sites serve scrambled text or special fonts so the copied text comes out as nonsense. No extension can fix that.

## Test it

There's a test page at `test/blocked-page.html` that uses every common blocking trick. Open it in Chrome to try the extension by hand.

To run the automatic test (needs [Node.js](https://nodejs.org)):

```
npm install
npx playwright install chromium
npm test
```

It loads the extension into a hidden Chrome window, checks that the page blocks everything while the extension is off, switches it on, and checks that everything works.
