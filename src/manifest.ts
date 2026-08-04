import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "Moodle Download",
  version: "1.0.0",
  description: "Moodleコースページからファイルを一括・選択ダウンロード",
  permissions: ["activeTab", "downloads", "storage"],
  host_permissions: ["https://*/*"],
  action: {
    default_popup: "src/popup/popup.html",
    default_title: "Moodle Download",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://*/*"],
      js: ["src/content/content.ts"],
      run_at: "document_idle",
    },
  ],
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
};

export default manifest;
