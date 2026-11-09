import type { MoodleFile } from "../types";
import { mergeDownloadFilename, sanitizeBaseName, toDownloadUrl } from "./filename";

type NameJob = { preferredName: string; iconExt?: string };

const pendingNames = new Map<number, NameJob>();
let nextJob: NameJob | null = null;
let suggesterRegistered = false;

export function registerFilenameSuggester(): void {
  if (suggesterRegistered) return;
  suggesterRegistered = true;

  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const job = pendingNames.get(item.id) ?? nextJob;
    if (!job) return;

    pendingNames.set(item.id, job);
    suggest({
      filename: mergeDownloadFilename(job.preferredName, item.filename, job.iconExt),
      conflictAction: "uniquify",
    });
  });
}

function waitForDownload(downloadId: number, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      pendingNames.delete(downloadId);
      if (ok) resolve();
      else reject(new Error(error ?? "ダウンロードが中断されました"));
    };

    const timer = setTimeout(() => {
      finish(false, "ダウンロードがタイムアウトしました");
    }, timeoutMs);

    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === "complete") finish(true);
      else if (delta.state?.current === "interrupted") {
        finish(false, delta.error?.current ?? "ダウンロードが中断されました");
      } else if (delta.error?.current) {
        finish(false, delta.error.current);
      }
    };

    chrome.downloads.onChanged.addListener(listener);

    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items[0];
      if (!item) return;
      if (item.state === "complete") finish(true);
      else if (item.state === "interrupted") {
        finish(false, item.error ?? "ダウンロードが中断されました");
      }
    });
  });
}

async function startChromeDownload(url: string, filename: string): Promise<number> {
  try {
    return await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
  } catch {
    return await chrome.downloads.download({
      url,
      conflictAction: "uniquify",
      saveAs: false,
    });
  }
}

export async function downloadFileViaChrome(file: MoodleFile): Promise<void> {
  registerFilenameSuggester();

  const url = toDownloadUrl(file.url);
  const filename = sanitizeBaseName(file.name);
  nextJob = { preferredName: filename, iconExt: file.iconExt };

  try {
    const downloadId = await startChromeDownload(url, filename);
    if (downloadId === undefined) {
      throw new Error("ダウンロードを開始できませんでした");
    }
    pendingNames.set(downloadId, { preferredName: filename, iconExt: file.iconExt });
    await waitForDownload(downloadId);
  } finally {
    nextJob = null;
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
