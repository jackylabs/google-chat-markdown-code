# Google Chat Markdown & Code

**English** | [繁體中文](README.zh-TW.md)

A Chrome extension that makes Google Chat messages easier to read:

- **Markdown**: tables, headings, blockquotes, lists and horizontal rules are rendered as formatted content.
- **Code highlighting**: code is colored by language with bold keywords, similar to Notepad++.

It only changes your own view. Other people, the mobile app and notification previews still see the original text. It also works for Chat inside Gmail.

## Requirements

- Google Chrome, or another Chromium browser that supports Manifest V3 (Edge, Brave, Arc, etc.)

## Installation

This extension is not on the Chrome Web Store. Install it with "Load unpacked".

1. Download this repo in one of two ways:
   - With git:

     ```sh
     git clone https://github.com/jackylabs/google-chat-markdown-code.git
     ```

   - Without git: on the repo page, click the green **Code** button, then **Download ZIP**, and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and pick the folder you downloaded. `manifest.json` must be directly inside that folder. Unzipping often adds an extra folder level, so pick the inner one.
5. Reload any open Google Chat or Gmail tabs.

## Updating

1. Get the new version. With git, run `git pull` in the folder. With ZIP, download again and unzip over the old files in the same place.
2. Open `chrome://extensions` and click reload ⟳ on the *Google Chat Markdown & Code* card.
3. Reload any open Google Chat or Gmail tabs.

## Uninstalling

Open `chrome://extensions` and click **Remove** on the *Google Chat Markdown & Code* card.

## Permissions

| Permission | Purpose |
|---|---|
| Access to `chat.google.com` | Injects styles and scripts only into Google Chat, including Chat inside Gmail |

No other permissions are needed. It collects and sends no data. Everything runs in your browser.

## Markdown

| Syntax | How to write it |
|---|---|
| Table | `\| col \| col \|`, then a second line `\|---\|--:\|` (`:` sets alignment) |
| Heading | `#` to `######` |
| Blockquote | `>` (can contain lists and tables) |
| List | `-`, `*`, `1.` |
| Horizontal rule | `---` |
| Inline | `**bold**` and `[text](url)` that Chat did not convert; bare URLs become links |

- Only messages that contain markdown blocks are processed. Ordinary chat messages are shown as Chat renders them.
- Bold, italic, strikethrough and links that Chat already formatted are kept as is.
- Line breaks inside paragraphs are kept, so one line stays one line like in Chat. GitHub would merge adjacent lines into a paragraph.
- Table text is 0.75 times the message font size.

## Code highlighting

**What gets highlighted**

- Code blocks wrapped in ```.
- Messages not wrapped in ``` that clearly look like code. They need a score of 30 or more and at least 5 lines. In testing, ordinary chat scored 0 to 7, English technical discussion at most 20, and SQL or Python files 44 to 99. Short code of about 15 lines or fewer does not score enough, so wrap it in ```.
- Inline code (`` `code` ``) stays monospaced but is not colored.

**Languages**

- If the first line holds only a language name, such as ```` ```java ````, `sql`, `delphi` or `c++`, that language is used and the line is hidden.
- Without a name, it auto-detects among Java, PHP, Python, JavaScript, HTML, CSS, Delphi, SQL and C++. If unsure, it leaves the code uncolored.
- When you name a language, any other language built into the highlight.js common bundle also works, such as `bash`, `json`, `go` or `csharp`.

**Colors**: the theme follows the message text color. The light theme mimics the Notepad++ default, with blue bold keywords, gray strings, green comments and orange numbers. The dark theme mimics VS Code Dark+.

## Diagnostics

- **Alt+click a message** to print the processing result and the message structure to the Console and copy them to the clipboard. The result shows how many code blocks were found, the detected language and the score. The structure shows tags, classes, fonts, and invisible characters as `\uXXXX`.
- If something fails or Chat keeps redrawing a message, that message is restored to its original form. The Console prints a message starting with `[gwt-md]`.

## How it works

- Each message is a `[role=group][data-id]` element. Content and code are found without relying on Google's obfuscated class names:
  - Markdown content: the deepest element that still contains all the markdown blocks.
  - Code blocks: detected by font, since they are monospaced. Chat renders each code line as a monospaced `<div>`, and adjacent ones are merged into one block.
  - Code without ```: the element that directly contains the most line breaks.
- The original is hidden with `.gwt-md-src` but not removed, and the result is inserted after it. Edited messages are redrawn automatically.
- When copying Chat elements, only `class`, `style` and link attributes are kept. Copying `jscontroller` and similar attributes lets Google's framework take over the redraw and causes an infinite loop.
- Chat enforces Trusted Types, so all elements are built with DOM APIs. The highlight.js output is also converted to DOM nodes.

## Files

| File | Contents |
|---|---|
| `manifest.json` | Extension settings. Injects only into `chat.google.com`, including the Chat iframe in Gmail |
| `chat-format.js` | All logic: markdown parsing and rendering, code detection and highlighting, diagnostics |
| `chat-format.css` | Styles and colors for tables, headings, blockquotes, lists and code |
| `vendor/` | highlight.js 11.11.1 and the Delphi language file. BSD-3-Clause, from cdnjs, SRI checked |
| `LICENSE` | MIT License |

## License

MIT License, see `LICENSE`. highlight.js in `vendor/` is BSD-3-Clause, with its notice at the top of each file.

## Not supported

- Nested lists (indentation), list items spanning multiple lines, and setext headings (a `===` line underneath).
