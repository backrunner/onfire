import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { svedocs } from "svedocs/vite";
import svedocsConfig from "./svedocs.config.ts";

export default defineConfig({
  build: { license: { fileName: "third-party-licenses.txt" } },
  plugins: [
    svedocs({
      config: svedocsConfig,
      theme: {
        components: {
          Navbar: "$lib/theme/Navbar.svelte",
          DocsShell: "$lib/theme/DocsShell.svelte",
          Sidebar: "$lib/theme/Sidebar.svelte",
          Footer: "$lib/theme/Footer.svelte",
          ThemeToggle: "$lib/theme/ThemeToggle.svelte",
        },
      },
    }),
    tailwindcss(),
    sveltekit(),
  ],
});
