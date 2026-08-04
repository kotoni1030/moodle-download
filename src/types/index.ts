export interface MoodleFile {
  id: string;
  name: string;
  url: string;
  type: "file" | "folder" | "resource";
}

export type MessageType =
  | { type: "SCAN_FILES" }
  | { type: "SCAN_RESULT"; files: MoodleFile[] }
  | { type: "SCAN_ERROR"; error: string }
  | {
      type: "DOWNLOAD_FILES";
      files: MoodleFile[];
    }
  | {
      type: "DOWNLOAD_PROGRESS";
      current: number;
      total: number;
      fileName: string;
    }
  | {
      type: "DOWNLOAD_COMPLETE";
      succeeded: number;
      failed: number;
    }
  | {
      type: "DOWNLOAD_ERROR";
      error: string;
    };

export interface DownloadResult {
  fileName: string;
  success: boolean;
  error?: string;
}
