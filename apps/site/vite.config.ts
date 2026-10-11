import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { svedocsPreprocess, svedocsSvelteExtensions } from "svedocs/svelte";
import { defineConfig } from "vite";
import { svedocs } from "svedocs/vite";
import svedocsConfig from "./svedocs.config.ts";

export default defineConfig({
  // svedocs 0.2.3 still imports the pre-v3 name for this unchanged API.
  resolve: { alias: { "$app/environment": "$app/env" } },
  build: { license: { fileName: "third-party-licenses.txt" } },
  plugins: [
    svedocs({
      config: svedocsConfig,
      theme: {
        components: {
          Navbar: "#lib/theme/Navbar.svelte",
          DocsShell: "#lib/theme/DocsShell.svelte",
          Sidebar: "#lib/theme/Sidebar.svelte",
          Footer: "#lib/theme/Footer.svelte",
          ThemeToggle: "#lib/theme/ThemeToggle.svelte",
        },
      },
    }),
    tailwindcss(),
    sveltekit({
      extensions: [...svedocsSvelteExtensions],
      preprocess: [vitePreprocess(), svedocsPreprocess()],
      adapter: adapter({ strict: false }),
    }),
  ],
});
