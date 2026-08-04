import type { MoodleFile } from "../types";

const DB_NAME = "moodle-download";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const DIR_HANDLE_KEY = "downloadDir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(DIR_HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await saveDirectoryHandle(handle);
  return handle;
}

export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

async function resolveFileName(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<string> {
  const base = fileName.includes(".") ? fileName : `${fileName}.bin`;
  let candidate = base;
  let counter = 1;

  while (true) {
    try {
      await dir.getFileHandle(candidate, { create: false });
      const dot = base.lastIndexOf(".");
      if (dot > 0) {
        candidate = `${base.slice(0, dot)} (${counter})${base.slice(dot)}`;
      } else {
        candidate = `${base} (${counter})`;
      }
      counter++;
    } catch {
      return candidate;
    }
  }
}

export async function downloadFileToDirectory(
  dir: FileSystemDirectoryHandle,
  file: MoodleFile
): Promise<void> {
  const response = await fetch(file.url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${file.name}`);
  }

  const blob = await response.blob();
  const fileName = await resolveFileName(dir, file.name);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function downloadFilesToDirectory(
  dir: FileSystemDirectoryHandle,
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
      await downloadFileToDirectory(dir, file);
      succeeded++;
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : "不明なエラー";
      errors.push(`${file.name}: ${msg}`);
    }
  }

  return { succeeded, failed, errors };
}
