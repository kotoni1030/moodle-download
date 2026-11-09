import { downloadFilesViaChrome, registerFilenameSuggester } from "../lib/chrome-downloader";
import type { MessageType, MoodleFile } from "../types";

registerFilenameSuggester();

let downloading = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Moodle Download extension installed");
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "moodle-download") return;

  port.onMessage.addListener((message: MessageType) => {
    if (message.type !== "DOWNLOAD_FILES") return;
    void handleDownload(message.files, port);
  });
});

async function handleDownload(files: MoodleFile[], port: chrome.runtime.Port): Promise<void> {
  if (downloading) {
    safePost(port, { type: "DOWNLOAD_ERROR", error: "別のダウンロードが進行中です。" });
    return;
  }

  downloading = true;
  try {
    const result = await downloadFilesViaChrome(files, (current, total, fileName) => {
      safePost(port, { type: "DOWNLOAD_PROGRESS", current, total, fileName });
    });
    safePost(port, {
      type: "DOWNLOAD_COMPLETE",
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "ダウンロードに失敗しました。";
    safePost(port, { type: "DOWNLOAD_ERROR", error: msg });
  } finally {
    downloading = false;
  }
}

function safePost(port: chrome.runtime.Port, message: MessageType): void {
  try {
    port.postMessage(message);
  } catch {
    // ポップアップが閉じてもダウンロード自体は継続する
  }
}
