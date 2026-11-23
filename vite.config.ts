import { defineConfig, loadEnv } from "vite";
import { FLOW_LIST_PLACEHOLDER, flowList } from "./src/scenario";

/** The public addresses `index.html` links to; see `.env`. */
const REQUIRED_ENV = ["VITE_SITE_URL", "VITE_GUIDE_URL", "VITE_REPO_URL"] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  for (const name of REQUIRED_ENV) {
    const value = env[name];
    if (!value) throw new Error(`missing ${name}; see .env`);
    if (new URL(value).protocol !== "https:") {
      throw new Error(`${name} must be an https URL`);
    }
  }
  // No source maps ship to the public site.
  return {
    build: { sourcemap: false },
    // The page copy lists the flows from the one shared definition.
    plugins: [
      {
        name: "flow-list",
        transformIndexHtml: (html: string) =>
          html.replaceAll(FLOW_LIST_PLACEHOLDER, flowList()),
      },
    ],
  };
});
