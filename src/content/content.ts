import { scanCourseFiles } from "../lib/moodle-scraper";
import type { MessageType } from "../types";

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  if (message.type !== "SCAN_FILES") return false;

  try {
    const files = scanCourseFiles();
    sendResponse({ type: "SCAN_RESULT", files } satisfies MessageType);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "ファイルの取得に失敗しました。";
    sendResponse({ type: "SCAN_ERROR", error: errorMessage } satisfies MessageType);
  }

  return true;
});
