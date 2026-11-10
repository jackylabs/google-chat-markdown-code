# Google Chat Markdown & Code

讓 Google Chat 的訊息更好讀的 Chrome 擴充功能：

- **Markdown**：表格、標題、引用、清單、分隔線顯示成格式化內容。
- **程式碼上色**：依語言上色、保留字加粗，類似 Notepad++。

只改自己的畫面；對方、手機 App、通知預覽看到的都還是原文。Gmail 裡的 Chat 也能用。

## 安裝

1. Chrome 開 `chrome://extensions`，打開右上「開發人員模式」。
2. 「載入未封裝項目」→ 選這個資料夾。
3. 重新整理 Google Chat 或 Gmail 分頁。

改了程式之後：在 `chrome://extensions` 按這個擴充功能的重新載入 ⟳，再重新整理分頁。

## Markdown

| 語法 | 寫法 |
|---|---|
| 表格 | `\| 欄 \| 欄 \|`，第二行 `\|---\|--:\|`（`:` 控制對齊） |
| 標題 | `#`～`######` |
| 引用 | `>`（裡面可再放清單、表格） |
| 清單 | `-`、`*`、`1.` |
| 分隔線 | `---` |
| 行內 | Chat 沒轉的 `**粗體**`、`[文字](網址)`；裸網址自動補連結 |

- 只處理含 markdown 區塊的訊息；一般聊天訊息照 Chat 原樣顯示。
- Chat 已轉好的粗體、斜體、刪除線、連結照原樣保留。
- 段落保留換行，跟 Chat 一樣一行就是一行（不像 GitHub 會把相鄰行併成一段）。
- 表格字體是訊息的 0.75 倍。

## 程式碼上色

**哪些會上色**

- 用 ``` 包的程式碼區塊。
- 沒用 ``` 包、但整則看起來就是程式碼的訊息：30 分以上、至少 5 行才算（實測一般聊天 0～7 分、英文技術討論最高 20 分、SQL／Python 檔 44～99 分）。短程式碼（約 15 行以下）分數不夠，請用 ``` 包。
- 行內程式碼（`` `code` ``）只維持等寬，不上色。

**語言**

- 第一行只寫語言名（例如 ```` ```java ````、`sql`、`delphi`、`c++`）就照它上色，並隱藏那一行。
- 沒寫就在 Java、PHP、Python、JavaScript、HTML、CSS、Delphi、SQL、C++ 之間自動偵測，沒把握時不上色。
- 寫語言名時也可用 highlight.js common 版內建的其他語言（如 `bash`、`json`、`go`、`csharp`）。

**配色**：依訊息文字顏色自動判斷深淺主題。淺色仿 Notepad++ 預設（保留字藍色粗體、字串灰、註解綠、數字橘），深色仿 VS Code Dark+。

## 診斷

- **Alt＋點一下訊息**：把處理結果（找到幾組程式碼、偵測成什麼語言、幾分）與訊息結構（標籤、class、字型、看不見的字元以 `\uXXXX` 標出）印到 Console，並複製到剪貼簿。
- 出錯或被 Chat 一直重畫時，該則訊息恢復原樣，Console 會印 `[gwt-md]` 開頭的訊息。

## 運作方式

- 每則訊息是 `[role=group][data-id]`；內文、程式碼都不靠 Google 的混淆 class 找：
  - Markdown 內文：往下找「最深、仍包含全部 markdown 區塊」的元素。
  - 程式碼區塊：用字型判斷（等寬）。Chat 的程式碼區塊是每行一個等寬 `<div>`，相鄰的併成一塊。
  - 沒包 ``` 的程式碼：直接含最多換行的元素。
- 原文只加 `.gwt-md-src` 藏起來（不刪），結果插在後面；訊息被編輯時自動重畫。
- 複製 Chat 的元素時只帶 `class`、`style` 與連結屬性：連 `jscontroller` 等一起複製的話，Google 的框架會接手重畫、變成無限循環。
- Chat 強制 Trusted Types，全部用 DOM API 建元素（highlight.js 的輸出也自己轉成 DOM）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `manifest.json` | 擴充功能設定（只注入 `chat.google.com`，含 Gmail 裡的 Chat iframe） |
| `chat-format.js` | 全部邏輯：markdown 解析與渲染、程式碼偵測與上色、診斷 |
| `chat-format.css` | 表格、標題、引用、清單、程式碼的樣式與配色 |
| `vendor/` | highlight.js 11.11.1 與 Delphi 語言檔（BSD-3-Clause，取自 cdnjs，已核對 SRI） |
| `LICENSE` | MIT License |

## 授權

MIT License，見 `LICENSE`。`vendor/` 的 highlight.js 是 BSD-3-Clause，授權聲明在檔案開頭。

## 沒做的

- 巢狀清單（縮排）、清單項目跨行、setext 標題（底下一行 `===`）。
