import type { MessageType, MoodleFile } from "../types";
import { downloadFilesViaChrome } from "../lib/chrome-downloader";
import {
  downloadFilesToDirectory,
  loadDirectoryHandle,
  pickDirectory,
  verifyDirectoryPermission,
} from "../lib/downloader";

type SaveMode = "browser" | "custom";

const folderNameEl = document.getElementById("folder-name")!;
const customFolderRowEl = document.getElementById("custom-folder-row") as HTMLDivElement;
const pickFolderBtn = document.getElementById("pick-folder") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const selectAllBtn = document.getElementById("select-all") as HTMLButtonElement;
const deselectAllBtn = document.getElementById("deselect-all") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const fileListEl = document.getElementById("file-list")!;
const selectionCountEl = document.getElementById("selection-count")!;
const downloadBtn = document.getElementById("download") as HTMLButtonElement;
const progressEl = document.getElementById("progress") as HTMLDivElement;
const progressFillEl = document.getElementById("progress-fill") as HTMLDivElement;
const progressTextEl = document.getElementById("progress-text") as HTMLParagraphElement;
const saveModeInputs = document.querySelectorAll<HTMLInputElement>('input[name="save-mode"]');

let files: MoodleFile[] = [];
let dirHandle: FileSystemDirectoryHandle | null = null;
let saveMode: SaveMode = "browser";

function getSaveMode(): SaveMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="save-mode"]:checked');
  return checked?.value === "custom" ? "custom" : "browser";
}

function showStatus(message: string, type: "error" | "info" | "success" = "info"): void {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function hideStatus(): void {
  statusEl.hidden = true;
}

function isDownloadable(file: MoodleFile): boolean {
  return file.type !== "folder";
}

function getSelectedFiles(): MoodleFile[] {
  const checkboxes = fileListEl.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]:checked:not(:disabled)'
  );
  const selectedIds = new Set(Array.from(checkboxes).map((cb) => cb.dataset.id!));
  return files.filter((f) => selectedIds.has(f.id));
}

function canDownload(): boolean {
  const count = getSelectedFiles().length;
  if (count === 0) return false;
  if (saveMode === "browser") return true;
  return dirHandle !== null;
}

function updateSelectionCount(): void {
  const count = getSelectedFiles().length;
  selectionCountEl.textContent = `${count} 件選択`;
  downloadBtn.disabled = !canDownload();
}

function updateSaveModeUi(): void {
  saveMode = getSaveMode();
  const isCustom = saveMode === "custom";
  customFolderRowEl.hidden = !isCustom;
  updateSelectionCount();
}

function renderFileList(): void {
  if (files.length === 0) {
    fileListEl.innerHTML = '<p class="empty">ファイルが見つかりませんでした。</p>';
    updateSelectionCount();
    return;
  }

  fileListEl.innerHTML = files
    .map((file) => {
      const downloadable = isDownloadable(file);
      const typeLabel =
        file.type === "folder" ? "フォルダ（中身は別ページから）" : "ファイル";
      return `
        <label class="file-item">
          <input
            type="checkbox"
            data-id="${escapeAttr(file.id)}"
            ${downloadable ? "checked" : "disabled"}
          />
          <div class="file-info">
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-type">${typeLabel}</div>
          </div>
        </label>
      `;
    })
    .join("");

  fileListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", updateSelectionCount);
  });

  updateSelectionCount();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("アクティブなタブが見つかりません。");
  return tab.id;
}

async function scanFiles(): Promise<void> {
  fileListEl.innerHTML = '<p class="loading">読み込み中...</p>';
  hideStatus();

  try {
    const tabId = await getActiveTabId();
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "SCAN_FILES",
    } satisfies MessageType)) as MessageType;

    if (!response || response.type === "SCAN_ERROR") {
      showStatus(
        response?.type === "SCAN_ERROR" ? response.error : "ファイルの取得に失敗しました。",
        "error"
      );
      fileListEl.innerHTML = '<p class="empty">—</p>';
      files = [];
      updateSelectionCount();
      return;
    }

    if (response.type !== "SCAN_RESULT") {
      showStatus("予期しない応答を受け取りました。", "error");
      return;
    }

    files = response.files;
    renderFileList();

    if (files.length > 0) {
      const downloadable = files.filter(isDownloadable).length;
      showStatus(`${files.length} 件見つかりました（ダウンロード可能: ${downloadable} 件）`, "info");
    }
  } catch {
    showStatus(
      "ページに接続できません。Moodleのコースページを開いてから再度お試しください。",
      "error"
    );
    fileListEl.innerHTML = '<p class="empty">—</p>';
    files = [];
    updateSelectionCount();
  }
}

async function initDirectory(): Promise<void> {
  try {
    dirHandle = await loadDirectoryHandle();
    if (dirHandle) {
      const ok = await verifyDirectoryPermission(dirHandle);
      if (ok) {
        folderNameEl.textContent = dirHandle.name;
        updateSelectionCount();
        return;
      }
      dirHandle = null;
    }
  } catch {
    dirHandle = null;
  }
  folderNameEl.textContent = "未選択";
}

saveModeInputs.forEach((input) => {
  input.addEventListener("change", updateSaveModeUi);
});

pickFolderBtn.addEventListener("click", async () => {
  try {
    dirHandle = await pickDirectory();
    folderNameEl.textContent = dirHandle.name;
    updateSelectionCount();
    showStatus(`保存先: ${dirHandle.name}`, "success");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showStatus(
      "フォルダの選択に失敗しました。ダウンロード/Moodle などのサブフォルダを作成して選んでください。",
      "error"
    );
  }
});

refreshBtn.addEventListener("click", () => void scanFiles());

selectAllBtn.addEventListener("click", () => {
  fileListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)').forEach(
    (cb) => {
      cb.checked = true;
    }
  );
  updateSelectionCount();
});

deselectAllBtn.addEventListener("click", () => {
  fileListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  updateSelectionCount();
});

downloadBtn.addEventListener("click", async () => {
  const selected = getSelectedFiles();
  if (selected.length === 0) return;

  downloadBtn.disabled = true;
  pickFolderBtn.disabled = true;
  refreshBtn.disabled = true;
  saveModeInputs.forEach((input) => {
    input.disabled = true;
  });
  progressEl.hidden = false;

  let result: { succeeded: number; failed: number; errors: string[] };

  if (saveMode === "browser") {
    result = await downloadFilesViaChrome(selected, (current, total, fileName) => {
      const pct = Math.round((current / total) * 100);
      progressFillEl.style.width = `${pct}%`;
      progressTextEl.textContent = `${current} / ${total}: ${fileName}`;
    });
  } else {
    if (!dirHandle) {
      showStatus("保存先フォルダを選択してください。", "error");
      progressEl.hidden = true;
      downloadBtn.disabled = false;
      pickFolderBtn.disabled = false;
      refreshBtn.disabled = false;
      saveModeInputs.forEach((input) => {
        input.disabled = false;
      });
      updateSelectionCount();
      return;
    }

    const ok = await verifyDirectoryPermission(dirHandle);
    if (!ok) {
      showStatus("フォルダへのアクセス権限がありません。再度選択してください。", "error");
      progressEl.hidden = true;
      downloadBtn.disabled = false;
      pickFolderBtn.disabled = false;
      refreshBtn.disabled = false;
      saveModeInputs.forEach((input) => {
        input.disabled = false;
      });
      updateSelectionCount();
      return;
    }

    result = await downloadFilesToDirectory(dirHandle, selected, (current, total, fileName) => {
      const pct = Math.round((current / total) * 100);
      progressFillEl.style.width = `${pct}%`;
      progressTextEl.textContent = `${current} / ${total}: ${fileName}`;
    });
  }

  progressEl.hidden = true;
  downloadBtn.disabled = false;
  pickFolderBtn.disabled = false;
  refreshBtn.disabled = false;
  saveModeInputs.forEach((input) => {
    input.disabled = false;
  });
  updateSelectionCount();

  if (result.failed === 0) {
    const destination =
      saveMode === "browser" ? "ダウンロードフォルダ" : folderNameEl.textContent;
    showStatus(`${result.succeeded} 件を ${destination} に保存しました。`, "success");
  } else {
    showStatus(
      `${result.succeeded} 件成功、${result.failed} 件失敗。\n${result.errors.slice(0, 3).join("\n")}`,
      result.succeeded > 0 ? "info" : "error"
    );
  }
});

updateSaveModeUi();
void initDirectory();
void scanFiles();
