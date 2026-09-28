import type { MoodleFile } from "../types";
import { extensionFromMoodleIcon, extensionFromUrl, hasKnownExtension } from "./filename";

const FILE_URL_PATTERNS = [
  /\/pluginfile\.php\//,
  /\/mod\/resource\/view\.php/,
  /\/mod\/resource\/.*\?.*$/,
  /\/mod\/folder\/view\.php/,
  /forcedownload=1/,
];

const SKIP_PATTERNS = [
  /\/mod\/forum\//,
  /\/mod\/assign\//,
  /\/mod\/quiz\//,
  /\/mod\/url\/view\.php/,
  /\/course\/view\.php\?.*section=/,
  /\/user\/profile\.php/,
  /\/login\//,
  /\/my\//,
  /\/admin\//,
  /\/calendar\//,
  /\/message\//,
  /\/grade\//,
  /\/blocks\//,
  /\/theme\//,
  /\/lib\//,
  /javascript:/,
  /#$|^$/,
];

function isCoursePage(): boolean {
  return /\/course\/view\.php/.test(window.location.pathname);
}

function isMoodleFileUrl(url: string): boolean {
  if (SKIP_PATTERNS.some((p) => p.test(url))) return false;
  return FILE_URL_PATTERNS.some((p) => p.test(url));
}

function normalizeUrl(href: string): string {
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

function extractIconExt(link: HTMLAnchorElement, activity: Element | null): string {
  const img =
    activity?.querySelector("img.activityicon, img.icon") ??
    link.querySelector("img") ??
    activity?.querySelector("img");
  return extensionFromMoodleIcon(img?.getAttribute("src"));
}

function extractFileName(link: HTMLAnchorElement, url: string, iconExt: string): string {
  const instancename = link.querySelector(".instancename");
  if (instancename) {
    const text = instancename.textContent?.trim() ?? "";
    const cleaned = text.replace(/\s*(ファイル|File|Resource|リソース|フォルダ|Folder)\s*$/i, "").trim();
    if (cleaned) return withHintExtension(sanitizeFileName(cleaned), url, iconExt);
  }

  const linkText = link.textContent?.trim() ?? "";
  if (linkText && linkText.length < 200) {
    const cleaned = linkText.replace(/\s*(ファイル|File|Resource|リソース|フォルダ|Folder)\s*$/i, "").trim();
    if (cleaned) return withHintExtension(sanitizeFileName(cleaned), url, iconExt);
  }

  const urlPath = new URL(url).pathname;
  const fromUrl = decodeURIComponent(urlPath.split("/").pop() ?? "download");
  if (fromUrl && fromUrl !== "view.php") return sanitizeFileName(fromUrl);

  return "download";
}

function withHintExtension(name: string, url: string, iconExt: string): string {
  if (hasKnownExtension(name)) return name;
  const ext = extensionFromUrl(url) || iconExt;
  return ext ? `${name}${ext}` : name;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";
}

function getFileType(url: string): MoodleFile["type"] {
  if (url.includes("/mod/folder/")) return "folder";
  if (url.includes("/pluginfile.php/")) return "file";
  return "resource";
}

function getActivityRoot(link: HTMLAnchorElement): Element | null {
  return (
    link.closest(".activity-item") ??
    link.closest(".activity") ??
    link.closest("[data-modname]") ??
    link.closest(".modtype_resource") ??
    link.closest(".modtype_folder")
  );
}

export function scanCourseFiles(): MoodleFile[] {
  if (!isCoursePage()) {
    throw new Error("コースページ（/course/view.php）で開いてください。");
  }

  const seen = new Set<string>();
  const files: MoodleFile[] = [];

  const contentRoot =
    document.querySelector("#region-main") ??
    document.querySelector('[role="main"]') ??
    document.querySelector("#page-content") ??
    document.body;

  const links = contentRoot.querySelectorAll<HTMLAnchorElement>("a[href]");

  for (const link of Array.from(links)) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const url = normalizeUrl(href);
    if (!isMoodleFileUrl(url)) continue;
    if (seen.has(url)) continue;

    const activity = getActivityRoot(link);
    const modname = activity?.getAttribute("data-modname");
    if (modname && !["resource", "folder", "url"].includes(modname)) continue;

    seen.add(url);

    const iconExt = extractIconExt(link, activity);
    let name = extractFileName(link, url, iconExt);
    const type = getFileType(url);

    if (type === "folder" && !name.toLowerCase().includes("folder") && !name.includes("フォルダ")) {
      name = `${name} (フォルダ)`;
    }

    files.push({
      id: url,
      name,
      url,
      type,
      iconExt: iconExt || undefined,
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return files;
}
