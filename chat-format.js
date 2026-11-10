// Google Chat Markdown & Code：只改自己畫面的 Google Chat 訊息顯示。
// 1. markdown（表格、標題、引用、清單、分隔線、段落）顯示成格式化內容，保留 Chat 已轉好的粗體、斜體、連結。
// 2. 程式碼依語言上色（highlight.js）：``` 區塊，以及整則看起來就是程式碼的一般文字。
// 原文節點只加 class 藏起來，結果插在它後面；Chat 強制 Trusted Types，所以全用 DOM API 建元素。
(function () {
  // ponytail: 只處理最內層的訊息，若 Chat 的訊息裡另有 [role=group][data-id]，改這裡
  const MESSAGE = '[role=group][data-id]:not(:has([role=group][data-id]))';

  // ---- 解析：只回傳 [start, end] 位置，渲染時再從帶格式的原文切出來 ----

  const SEPARATOR_CELL = /^:?-+:?$/;
  const HEADING = /^\s{0,3}(#{1,6})\s+/;
  const QUOTE = /^\s{0,3}>\s?/;
  const LIST_ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+/;
  const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

  function trimRange(text, start, end) {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return [start, end];
  }

  function splitRow(text, [lineStart, lineEnd]) {
    const cells = [];
    let start = lineStart;
    for (let i = lineStart; i <= lineEnd; i++) {
      if (i === lineEnd || (text[i] === '|' && text[i - 1] !== '\\')) {
        cells.push(trimRange(text, start, i));
        start = i + 1;
      }
    }
    const line = text.slice(lineStart, lineEnd);
    if (line.trimStart().startsWith('|')) cells.shift();
    if (/(^|[^\\])\|\s*$/.test(line)) cells.pop();
    return cells;
  }

  function alignOf(cell) {
    const left = cell.startsWith(':'), right = cell.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
  }

  // lines：每行的 [start, end]；回傳區塊陣列，type 為 table / heading / rule / quote / list / paragraph
  function parseLines(text, lines) {
    const slice = ([s, e]) => text.slice(s, e);
    const isSeparator = line => slice(line).includes('|')
      && splitRow(text, line).every(cell => SEPARATOR_CELL.test(slice(cell)));
    const isTableAt = i => slice(lines[i]).includes('|') && lines[i + 1] && isSeparator(lines[i + 1])
      && splitRow(text, lines[i]).length === splitRow(text, lines[i + 1]).length;
    const startsBlock = i => {
      const s = slice(lines[i]);
      return HEADING.test(s) || QUOTE.test(s) || LIST_ITEM.test(s) || RULE.test(s) || isTableAt(i);
    };

    const parts = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i], s = slice(line);
      let m;
      if (!s.trim()) { i++; continue; }

      if (isTableAt(i)) {
        const header = splitRow(text, line), columns = header.length;
        const align = splitRow(text, lines[i + 1]).map(cell => alignOf(slice(cell)));
        const rows = [];
        for (i += 2; i < lines.length && slice(lines[i]).includes('|') && slice(lines[i]).trim(); i++) {
          const cells = splitRow(text, lines[i]);
          rows.push(Array.from({ length: columns }, (_, k) => cells[k] ?? [0, 0]));
        }
        parts.push({ type: 'table', header, align, rows });
      } else if ((m = s.match(HEADING))) {
        parts.push({ type: 'heading', level: m[1].length, range: trimRange(text, line[0] + m[0].length, line[1]) });
        i++;
      } else if (RULE.test(s)) {
        parts.push({ type: 'rule' });
        i++;
      } else if (QUOTE.test(s)) {
        const inner = [];
        for (; i < lines.length && (m = slice(lines[i]).match(QUOTE)); i++) inner.push([lines[i][0] + m[0].length, lines[i][1]]);
        parts.push({ type: 'quote', parts: parseLines(text, inner) });
      } else if ((m = s.match(LIST_ITEM))) {
        const ordered = m[1] !== undefined, start = ordered ? Number(m[1]) : 1, items = [];
        for (; i < lines.length && (m = slice(lines[i]).match(LIST_ITEM)) && (m[1] !== undefined) === ordered; i++) {
          items.push(trimRange(text, lines[i][0] + m[0].length, lines[i][1]));
        }
        parts.push({ type: 'list', ordered, start, items });
      } else {
        // 記每一行的位置而不是一整段：引用裡的段落，行與行之間夾著 "> "
        const paragraph = [trimRange(text, ...line)];
        for (i++; i < lines.length && slice(lines[i]).trim() && !startsBlock(i); i++) paragraph.push(trimRange(text, ...lines[i]));
        parts.push({ type: 'paragraph', lines: paragraph });
      }
    }
    return parts;
  }

  // 只有段落（沒有任何 markdown 區塊）時回傳 null，訊息照 Chat 原樣顯示
  function parse(text) {
    const lines = [];
    let pos = 0;
    for (const line of text.split('\n')) { lines.push([pos, pos + line.length]); pos += line.length + 1; }
    const parts = parseLines(text, lines);
    return parts.some(p => p.type !== 'paragraph') ? parts : null;
  }

  if (typeof module === 'object') { module.exports = { parse }; return; }

  // ---- 原文轉成帶格式的文字片段 ----

  const BLOCK_DISPLAY = /^(block|flex|grid|list-item|table)/;
  const CODE_TAGS = new Set(['PRE', 'CODE', 'KBD', 'SAMP']);
  // 從編輯器貼上時 Chat 可能保留原字型（Consolas、Menlo…），名稱不一定有 mono
  const CODE_FONT = /mono|consolas|courier|menlo|monaco|source code|fira code|cascadia/i;
  const isCode = (el, style) => CODE_TAGS.has(el.tagName) || CODE_FONT.test(style.fontFamily);

  function listMarker(li) {
    const list = li.parentElement;
    if (list?.tagName !== 'OL') return '- ';
    return `${[...list.children].indexOf(li) + (list.start || 1)}. `;
  }

  const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

  // 每段文字記下由外到內要複製的祖先（行內元素：粗體、連結、行內程式碼…）。
  // 程式碼區塊（等寬的區塊元素）整塊讀成一個片段，渲染時放進自己的 <pre>，不複製 Chat 的結構：
  // Chat 的程式碼區塊可能每行一個元素，樣式也依賴原本的位置，複製過去會散掉。
  // 回傳的 text 用來解析：程式碼的字元全換成 x、零寬字元換成空白（長度不變），不會被當成 markdown。
  // sourceOnly：只要原始文字（給 sourceText 用），程式碼區塊不整塊處理。
  function toRuns(root, sourceOnly = false) {
    const runs = [];
    let length = 0;
    const push = (text, chain, code, codeBlock = false, separator = false) => {
      runs.push({ text, chain, code, codeBlock, separator, start: length });
      length += text.length;
    };
    const newline = () => { if (length && !runs.at(-1).text.endsWith('\n')) push('\n', [], false); };
    // Chat 的程式碼區塊是每行一個等寬 <div>：緊接在上一行程式碼後面的就併進同一塊
    let openCode = null;
    const appendCodeLine = text => {
      if (openCode && runs.at(-1)?.separator && runs.at(-2) === openCode) {
        runs.pop();
        openCode.text += '\n' + text;
        length = openCode.start + openCode.text.length;
      } else {
        newline();
        push(text, [], true, true);
        openCode = runs.at(-1);
      }
      push('\n', [], false, false, true);
    };
    const walk = (node, chain, code) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { push(child.nodeValue, chain, code); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (child.tagName === 'BR') { push('\n', chain, code); continue; }
        const style = getComputedStyle(child);
        if (style.display === 'none') continue;
        const childIsCode = isCode(child, style);
        if (!BLOCK_DISPLAY.test(style.display)) { walk(child, [...chain, child], code || childIsCode); continue; }
        if (childIsCode && !code && !sourceOnly) { appendCodeLine(sourceText(child)); continue; }
        newline();
        if (child.tagName === 'LI') push(listMarker(child), [], false); // Chat 自己轉好的清單
        walk(child, childIsCode ? [...chain, child] : chain, code || childIsCode);
        newline();
      }
    };
    walk(root, [], false);
    const text = runs.map(r => (r.code ? 'x'.repeat(r.text.length) : r.text.replace(ZERO_WIDTH, ' '))).join('');
    return { runs, text };
  }

  // ---- 渲染 ----

  // 網址只認 ASCII（不含 |），中文常緊接在網址後；結尾的標點不算進網址
  const URL_PATTERN = /https?:\/\/[\x21-\x7b\x7d\x7e]*[\w\/#=&%+~-]/.source;
  // Chat 沒轉的行內 markdown：**粗體**、[文字](網址)、`程式碼`、裸網址
  const INLINE = new RegExp(String.raw`\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|` + '`([^`]+)`|' + URL_PATTERN, 'g');
  const SAFE_HREF = /^(https?:|mailto:)/i;

  function element(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function link(text, href) {
    const a = element('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function inlineMarkdown(text) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      fragment.append(text.slice(last, m.index));
      if (m[1] !== undefined) { const strong = element('strong'); strong.append(inlineMarkdown(m[1])); fragment.append(strong); }
      else if (m[2] !== undefined) fragment.append(link(m[2], m[3]));
      else if (m[4] !== undefined) { const code = element('code'); code.textContent = m[4]; fragment.append(code); }
      else fragment.append(link(m[0], m[0]));
      last = m.index + m[0].length;
    }
    fragment.append(text.slice(last));
    return fragment;
  }

  const isUnsafeLink = el => el.tagName === 'A' && !SAFE_HREF.test(el.href);

  // 不用 cloneNode：會連 jscontroller、jsaction 等一起複製，Google 的框架看到新元素就接手重畫，變成無限循環。
  // 只帶外觀需要的屬性。
  const KEPT_ATTRIBUTES = ['class', 'style', 'href', 'target', 'rel', 'dir', 'lang'];
  function shallowCopy(source) {
    const copy = document.createElementNS(source.namespaceURI, source.localName);
    for (const name of KEPT_ATTRIBUTES) {
      if (source.hasAttribute(name)) copy.setAttribute(name, source.getAttribute(name));
    }
    return copy;
  }

  // 依各片段的祖先鏈重建樹：相鄰片段共用的祖先只複製一次，程式碼區塊不會被切成好幾塊
  function richSlice(runs, [start, end], unescapePipe = false) {
    const fragment = document.createDocumentFragment();
    let open = []; // 目前開著的 { source, copy }，由外到內
    for (const run of runs) {
      const from = Math.max(start, run.start), to = Math.min(end, run.start + run.text.length);
      if (from >= to) continue;
      let text = run.text.slice(from - run.start, to - run.start);
      if (run.codeBlock) {
        open = [];
        const pre = element('pre', 'gwt-code-block');
        pre.textContent = text;
        fragment.append(pre);
        continue;
      }
      if (unescapePipe && !run.code) text = text.replace(/\\\|/g, '|');

      const chain = run.chain.filter(el => !isUnsafeLink(el));
      let shared = 0;
      while (shared < open.length && open[shared].source === chain[shared]) shared++;
      open = open.slice(0, shared);
      for (const source of chain.slice(shared)) {
        const copy = shallowCopy(source);
        (open.at(-1)?.copy ?? fragment).append(copy);
        open.push({ source, copy });
      }
      const plain = run.code || run.chain.some(el => el.tagName === 'A');
      (open.at(-1)?.copy ?? fragment).append(plain ? text : inlineMarkdown(text));
    }
    return fragment;
  }

  function withContent(tag, className, runs, range, unescapePipe) {
    const el = element(tag, className);
    el.append(richSlice(runs, range, unescapePipe));
    return el;
  }

  function renderTable({ header, align, rows }, runs) {
    const toRow = (cells, tag) => {
      const tr = element('tr');
      cells.forEach((cell, k) => {
        const td = withContent(tag, '', runs, cell, true);
        if (align[k]) td.style.textAlign = align[k];
        tr.append(td);
      });
      return tr;
    };
    const table = element('table');
    table.createTHead().append(toRow(header, 'th'));
    const body = table.createTBody();
    rows.forEach(r => body.append(toRow(r, 'td')));
    const wrap = element('div', 'gwt-md-wrap');
    wrap.append(table);
    return wrap;
  }

  function renderList({ ordered, start, items }, runs) {
    const list = element(ordered ? 'ol' : 'ul');
    if (ordered && start !== 1) list.start = start;
    items.forEach(item => list.append(withContent('li', '', runs, item)));
    return list;
  }

  function renderParts(parts, runs) {
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      switch (part.type) {
        case 'table': fragment.append(renderTable(part, runs)); break;
        case 'heading': fragment.append(withContent(`h${part.level}`, '', runs, part.range)); break;
        case 'rule': fragment.append(element('hr')); break;
        case 'list': fragment.append(renderList(part, runs)); break;
        case 'quote': { const q = element('blockquote'); q.append(renderParts(part.parts, runs)); fragment.append(q); break; }
        default: {
          const p = element('div', 'gwt-md-text');
          part.lines.forEach((line, k) => p.append(k ? '\n' : '', richSlice(runs, line)));
          fragment.append(p);
        }
      }
    }
    return fragment;
  }

  // ---- 掛到 Chat ----

  const markdownScore = text => (parse(text) || []).filter(p => p.type !== 'paragraph').length;

  // 不靠混淆 class：往下走到「最深、且仍包含全部 markdown 區塊」的元素，那就是訊息內文
  function findBody(message) {
    const score = markdownScore(message.innerText);
    if (!score) return null;
    let node = message;
    descend: for (;;) {
      for (const child of node.children) {
        if (markdownScore(child.innerText || '') === score) { node = child; continue descend; }
      }
      break;
    }
    return node === message || node.closest('[contenteditable="true"]') || isInsideCode(node, message) ? null : node;
  }

  // 用字型判斷，不看標籤：Chat 的程式碼區塊不一定是 <pre>
  function isInsideCode(node, message) {
    for (let el = node; el && el !== message; el = el.parentElement) {
      if (isCode(el, getComputedStyle(el))) return true;
    }
    return false;
  }

  function renderMarkdown(message) {
    const body = findBody(message);
    if (!body) return;
    const { runs, text } = toRuns(body);
    const parts = parse(text);
    if (!parts) return;
    const out = element('div', 'gwt-md-out');
    out.append(renderParts(parts, runs));
    body.classList.add('gwt-md-src');
    body.after(out);
  }

  // ---- 程式碼區塊語法上色（highlight.js，vendor/ 內建） ----

  const AUTO_LANGUAGES = ['java', 'php', 'python', 'javascript', 'xml', 'css', 'delphi', 'sql', 'cpp'];
  const MIN_AUTO_RELEVANCE = 3; // 自動偵測太沒把握時不上色，免得用錯語言亂塗
  // 沒用 ``` 包的一般文字要更有把握才當程式碼：實測一般聊天 0～7 分、英文技術討論最高 20 分，
  // SQL／Python 檔 44～99 分。
  // ponytail: 單一分數門檻，短程式碼（約 15 行以下）分數不夠，仍要用 ``` 包；誤判變多再加結構特徵
  const PLAIN_MIN_RELEVANCE = 30, PLAIN_MIN_LINES = 5;
  const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };

  // highlight.js 只輸出 <span class="…">、</span> 與跳脫過的文字；Chat 擋 innerHTML，自己轉成 DOM
  function highlightedNodes(html) {
    const root = document.createDocumentFragment();
    const stack = [root];
    for (const [, scope, close, text] of html.matchAll(/<span class="([^"]*)">|(<\/span>)|([^<]+)/g)) {
      if (scope !== undefined) { const span = element('span', scope); stack.at(-1).append(span); stack.push(span); }
      else if (close) { if (stack.length > 1) stack.pop(); }
      else stack.at(-1).append(text.replace(/&(amp|lt|gt|quot|#x27);/g, e => ENTITIES[e]));
    }
    return root;
  }

  // 第一行只寫語言名（```java）時照它上色並拿掉那行，否則自動偵測
  function highlight(code) {
    const [first, ...rest] = code.split('\n');
    const named = rest.length && hljs.getLanguage(first.trim()) ? first.trim() : null;
    if (named) return hljs.highlight(rest.join('\n').replace(/^\n+/, ''), { language: named, ignoreIllegals: true });
    const result = hljs.highlightAuto(code, AUTO_LANGUAGES);
    return result.relevance >= MIN_AUTO_RELEVANCE ? result : null;
  }

  function isLightText(el) {
    const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
  }

  // 程式碼區塊用字型判斷，不看標籤：找最外層的等寬元素，相鄰的兄弟併成一組。
  // Chat 的程式碼區塊是每行一個等寬 <div>，外層 <article> 不是等寬。
  // 行內程式碼（單一個行內元素、單行）維持 Chat 原樣，不上色。
  function findCodeBlocks(message) {
    const roots = [];
    for (const el of message.querySelectorAll('*')) {
      if (el.closest('.gwt-md-src') || roots.some(root => root.contains(el))) continue;
      if (isCode(el, getComputedStyle(el))) roots.push(el);
    }
    const groups = [];
    for (const root of roots) {
      const group = groups.at(-1);
      if (group && group.at(-1).nextElementSibling === root) group.push(root);
      else groups.push([root]);
    }
    return groups.filter(group => group.length > 1
      || BLOCK_DISPLAY.test(getComputedStyle(group[0]).display)
      || (group[0].innerText || '').includes('\n'));
  }

  // 自己渲染的區塊直接上色；Chat 原本的區塊一樣藏起來、插上色後的複本
  function highlightCodeBlocks(message) {
    if (typeof hljs === 'undefined') return;
    for (const group of findCodeBlocks(message)) {
      try {
        highlightGroup(group);
      } catch (error) {
        console.error('[gwt-md] 程式碼區塊上色失敗，維持原樣', error, group);
      }
    }
  }

  // 不用 innerText：容器沒保留空白時縮排會被吃掉，每行一個 <div><br></div> 的空行也會變兩行
  function sourceText(block) {
    return toRuns(block, true).runs.map(r => r.text).join('').replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
  }

  // 自己畫的 <pre> 直接上色；Chat 原本的整組行藏起來，後面插一個上色後的 <pre>
  function highlightGroup(group) {
    const result = highlight(group.map(sourceText).join('\n'));
    if (result) showHighlighted(group, result);
  }

  function showHighlighted(group, result) {
    const ours = group[0].closest('.gwt-md-out');
    const target = ours ? group[0] : element('pre', 'gwt-code-block gwt-md-code');
    target.replaceChildren(highlightedNodes(result.value));
    target.classList.add('gwt-hl', isLightText(group[0]) ? 'gwt-hl-dark' : 'gwt-hl-light');
    target.dataset.language = result.language;
    if (!ours) {
      group.forEach(el => el.classList.add('gwt-md-src'));
      group.at(-1).after(target);
    }
  }

  // 沒用 ``` 包的程式碼，Chat 當一般文字顯示（文字＋<br>，不是等寬）：直接含最多換行的元素就是內文
  function findPlainText(message) {
    let best = null, bestBreaks = 0;
    for (const el of message.querySelectorAll('*')) {
      if (el.closest('[contenteditable="true"]')) continue;
      const breaks = [...el.childNodes].reduce((n, child) => n
        + (child.nodeName === 'BR' ? 1 : child.nodeType === Node.TEXT_NODE ? (child.nodeValue.match(/\n/g) || []).length : 0), 0);
      if (breaks > bestBreaks) { best = el; bestBreaks = breaks; }
    }
    return best;
  }

  function detectPlainCode(message) {
    if (typeof hljs === 'undefined' || findCodeBlocks(message).length) return null;
    const body = findPlainText(message);
    const code = body && sourceText(body);
    if (!code || code.split('\n').filter(line => line.trim()).length < PLAIN_MIN_LINES) return null;
    return { body, result: hljs.highlightAuto(code, AUTO_LANGUAGES) };
  }

  // 整則看起來就是程式碼時當程式碼上色，不再當 markdown（Python 的 # 註解不會變標題）
  function highlightPlainText(message) {
    const plain = detectPlainCode(message);
    if (!plain || plain.result.relevance < PLAIN_MIN_RELEVANCE) return false;
    showHighlighted([plain.body], plain.result);
    return true;
  }

  function reset(message) {
    message.querySelectorAll('.gwt-md-out, .gwt-md-code').forEach(n => n.remove());
    message.querySelectorAll('.gwt-md-src').forEach(n => n.classList.remove('gwt-md-src'));
  }

  const lastSeen = new WeakMap(); // 訊息 → 上次處理完的 textContent；沒變就跳過
  const recentRuns = new WeakMap(); // 訊息 → 最近幾次處理的時間
  const gaveUp = new WeakSet();
  const LOOP_WINDOW_MS = 5000, LOOP_LIMIT = 8;

  // Chat 若一直把我們改的 DOM 還原，就會無限重畫；同一則訊息短時間內處理太多次就放棄，顯示原文
  function isLooping(message) {
    const now = Date.now();
    const runs = (recentRuns.get(message) || []).filter(t => now - t < LOOP_WINDOW_MS);
    runs.push(now);
    recentRuns.set(message, runs);
    return runs.length > LOOP_LIMIT;
  }

  // 診斷用：上次處理完到現在，訊息文字從哪裡開始不一樣
  function changedText(message) {
    const before = lastSeen.get(message) || '', after = message.textContent;
    let i = 0;
    while (i < before.length && before[i] === after[i]) i++;
    return { 之前: before.slice(i, i + 80), 之後: after.slice(i, i + 80) };
  }

  function process(message) {
    if (gaveUp.has(message) || lastSeen.get(message) === message.textContent) return;
    try {
      reset(message);
      if (isLooping(message)) {
        gaveUp.add(message);
        console.warn('[gwt-md] 這則訊息一直被 Chat 重畫，放棄處理、顯示原文', changedText(message), message);
        return;
      }
      if (!highlightPlainText(message)) {
        renderMarkdown(message);
        highlightCodeBlocks(message);
      }
    } catch (error) {
      // 一則訊息出錯不影響其他訊息；還原成 Chat 原樣
      console.error('[gwt-md] 處理訊息失敗', error, message);
      reset(message);
    }
    lastSeen.set(message, message.textContent);
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      document.querySelectorAll(MESSAGE).forEach(process);
    }, 150);
  }

  // content script 的變數在隔離環境，頁面 Console 看不到；版本留在 DOM 上，方便確認載入的是哪一版
  const VERSION = globalThis.chrome?.runtime?.getManifest?.().version ?? 'dev';
  document.documentElement.dataset.gwtMd = VERSION;

  // ---- 診斷：Alt+點訊息，把結構印到 Console 並複製（在 Chat 所在的 frame 跑，不用切換 Console 的 frame） ----

  const showInvisible = text => text.replace(/[\u00a0\u200b-\u200f\u2060\ufeff]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

  function describeTree(node, depth = 0, lines = []) {
    for (const child of node.childNodes) {
      const pad = '  '.repeat(depth);
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue.trim()) lines.push(pad + JSON.stringify(showInvisible(child.nodeValue.slice(0, 40))));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const style = getComputedStyle(child);
      const classes = child.classList.length ? '.' + [...child.classList].join('.') : '';
      const parentFont = child.parentElement && getComputedStyle(child.parentElement).fontFamily;
      const font = style.fontFamily !== parentFont ? ` font=${style.fontFamily.slice(0, 40)}` : '';
      lines.push(`${pad}<${child.localName}${classes}> ${style.display}${isCode(child, style) ? ' code' : ''}${font} ws=${style.whiteSpace}`);
      if (depth < 30) describeTree(child, depth + 1, lines);
    }
    return lines;
  }

  // 處理結果：找到幾組程式碼、各自偵測成什麼語言、幾分（低於門檻就不上色）
  function diagnose(message) {
    const count = selector => message.querySelectorAll(selector).length;
    const groups = findCodeBlocks(message);
    const lines = [
      `處理結果：放棄=${gaveUp.has(message) ? '是' : '否'}，markdown=${count('.gwt-md-out')}，`
        + `已上色=${count('.gwt-hl')}，藏原文=${count('.gwt-md-src')}，找到未上色的程式碼 ${groups.length} 組（門檻 ${MIN_AUTO_RELEVANCE} 分）`,
    ];
    const plain = !message.querySelector('.gwt-hl') && detectPlainCode(message);
    if (plain) {
      lines.push(`一般文字（沒用 \`\`\` 包）：自動偵測 ${plain.result.language}（${plain.result.relevance} 分），`
        + `門檻 ${PLAIN_MIN_RELEVANCE} 分、至少 ${PLAIN_MIN_LINES} 行`);
    }
    for (const group of groups) {
      const code = group.map(sourceText).join('\n');
      const auto = typeof hljs === 'undefined' ? null : hljs.highlightAuto(code, AUTO_LANGUAGES);
      lines.push(`  ${group.length} 個元素，第一行 ${JSON.stringify(showInvisible(code.split('\n')[0].slice(0, 40)))}，`
        + `自動偵測 ${auto ? `${auto.language}（${auto.relevance} 分）` : 'highlight.js 沒載入'}`);
    }
    return lines;
  }

  document.addEventListener('click', event => {
    if (!event.altKey) return;
    const message = event.target.closest?.('[role=group][data-id]');
    if (!message) return;
    const report = [`[gwt-md] 版本 ${VERSION}`, ...diagnose(message), '訊息結構：', ...describeTree(message)].join('\n');
    console.log(report);
    navigator.clipboard?.writeText(report).catch(() => {});
  }, true);

  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true, characterData: true });
  scheduleScan();
})();
