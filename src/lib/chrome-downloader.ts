import type { MoodleFile } from "../types";
import { ensureExtension, toDownloadUrl } from "./filename";

function waitForDownload(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;

      if (delta.state?.current === "complete") {
        chrome.downloads.onChanged.removeListener(listener);
        resolve();
      } else if (delta.state?.current === "interrupted") {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error("ダウンロードが中断されました"));
      } else if (delta.error?.current) {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error(delta.error.current));
      }
    };

    chrome.downloads.onChanged.addListener(listener);

    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items[0];
      if (!item) {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error("ダウンロードを開始できませんでした"));
        return;
      }
      if (item.state === "complete") {
        chrome.downloads.onChanged.removeListener(listener);
        resolve();
      } else if (item.state === "interrupted") {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error(item.error ?? "ダウンロードが中断されました"));
      }
    });
  });
}

export async function downloadFileViaChrome(file: MoodleFile): Promise<void> {
  const response = await fetch(toDownloadUrl(file.url), { credentials: "include" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${file.name}`);
  }

  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const filename = ensureExtension(file.name, {
    contentDisposition: response.headers.get("content-disposition"),
    mime: response.headers.get("content-type") || blob.type,
    url: response.url || file.url,
    bytes,
    iconExt: file.iconExt,
  });

  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    await waitForDownload(downloadId);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadFilesViaChrome(
  files: MoodleFile[],
  onProgress: (current: number, total: number, fileName: string) => void
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i + 1, files.length, file.name);
    try {
      await downloadFileViaChrome(file);
      succeeded++;
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : "不明なエラー";
      errors.push(`${file.name}: ${msg}`);
    }
  }

  return { succeeded, failed, errors };
}
