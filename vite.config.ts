import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";

// Deploy visibility: the footer shows the last commit's time + short SHA,
// and version.json exposes the same for machine polling (the R7 "your
// change is live" hook). Read once at config time; a git-less build
// (tarball) degrades to a dev stamp rather than failing.
const commit = (() => {
  try {
    return {
      iso: execSync("git log -1 --format=%cI").toString().trim(),
      sha: execSync("git log -1 --format=%h").toString().trim(),
    };
  } catch {
    return { iso: "", sha: "dev" };
  }
})();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __COMMIT_ISO__: JSON.stringify(commit.iso),
    __COMMIT_SHA__: JSON.stringify(commit.sha),
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    {
      name: "version-json",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ sha: commit.sha, commitTime: commit.iso }),
        });
      },
    } as Plugin,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
