const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/x-pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "application/vnd.oasis.opendocument.presentation": ".odp",
  "application/vnd.oasis.opendocument.spreadsheet": ".ods",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "application/json": ".json",
};

const ICON_TO_EXT: Record<string, string> = {
  pdf: ".pdf",
  document: ".docx",
  powerpoint: ".pptx",
  spreadsheet: ".xlsx",
  archive: ".zip",
  text: ".txt",
  image: ".jpg",
  video: ".mp4",
  audio: ".mp3",
  html: ".html",
};

const KNOWN_EXTS = new Set([
  "pdf",
  "zip",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "txt",
  "csv",
  "html",
  "htm",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "mp4",
  "mp3",
  "json",
  "bin",
]);

export function hasKnownExtension(name: string): boolean {
  const ext = getExtension(name);
  return ext !== "" && KNOWN_EXTS.has(ext.slice(1).toLowerCase());
}

export function getExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const match = base.match(/(\.[a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "";
}

export function extensionFromMoodleIcon(iconSrc: string | null | undefined): string {
  if (!iconSrc) return "";
  const match = iconSrc.match(/\/f\/([a-z0-9]+)/i);
  if (!match) return "";
  return ICON_TO_EXT[match[1].toLowerCase()] ?? "";
}

function decodeRfc5987(value: string): string {
  try {
    const parts = value.split("''");
    const encoded = parts.length > 1 ? parts.slice(1).join("''") : value;
    return decodeURIComponent(encoded.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function filenameFromContentDisposition(header: string | null): string {
  if (!header) return "";

  const utf8 = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (utf8) {
    const raw = utf8[1].trim().replace(/^["']|["']$/g, "");
    const decoded = decodeRfc5987(raw);
    if (decoded) return decoded;
  }

  const plain = header.match(/filename\s*=\s*([^;]+)/i);
  if (plain) {
    return plain[1].trim().replace(/^["']|["']$/g, "");
  }

  return "";
}

export function extensionFromMime(mime: string | null | undefined): string {
  if (!mime) return "";
  const type = mime.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[type] ?? "";
}

export function extensionFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.slice(0, 5));
    if (head === "%PDF-") return ".pdf";
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return ".zip";
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return ".png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return ".jpg";
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return ".gif";
    }
  }
  return "";
}

export function extensionFromUrl(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split("/").pop() ?? "";
    const ext = getExtension(last);
    return ext === ".php" || ext === ".html" ? "" : ext;
  } catch {
    return "";
  }
}

export function ensureExtension(
  preferredName: string,
  options: {
    contentDisposition?: string | null;
    mime?: string | null;
    url?: string;
    bytes?: Uint8Array;
    iconExt?: string;
  }
): string {
  const fromHeader = filenameFromContentDisposition(options.contentDisposition ?? null);
  const headerName = fromHeader ? sanitizeBaseName(fromHeader) : "";

  let name = sanitizeBaseName(preferredName);
  if (!name) name = headerName || "download";

  if (hasKnownExtension(name) && getExtension(name) !== ".bin") {
    return name;
  }

  const ext =
    (hasKnownExtension(headerName) ? getExtension(headerName) : "") ||
    extensionFromMime(options.mime) ||
    (options.bytes ? extensionFromBytes(options.bytes) : "") ||
    (options.url ? extensionFromUrl(options.url) : "") ||
    options.iconExt ||
    (hasKnownExtension(headerName) ? getExtension(headerName) : "");

  if (!ext || ext === ".bin") {
    return stripBinExtension(name);
  }

  if (getExtension(name) === ".bin") {
    return `${name.slice(0, -4)}${ext}`;
  }

  if (!getExtension(name)) {
    return `${name}${ext}`;
  }

  return name;
}

function stripBinExtension(name: string): string {
  return name.toLowerCase().endsWith(".bin") ? name.slice(0, -4) : name;
}

export function sanitizeBaseName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";
}

export function toDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/mod/resource/view.php") && !parsed.searchParams.has("redirect")) {
      parsed.searchParams.set("redirect", "1");
    }
    return parsed.href;
  } catch {
    return url;
  }
}
