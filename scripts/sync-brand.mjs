import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(resolve(root, "docs/assets/onfire-mark.svg"), "utf8");
const body = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1].trim().replaceAll("\n  ", "\n");
if (!body) throw new Error("Missing OnFire SVG source");
const outputs = new Map([
  ["src/app/icon.svg", source],
  ["apps/site/static/onfire-mark.svg", source],
  ["apps/site/static/favicon.svg", source],
]);

// Inline the same vector in React so customer reverse proxies need no new assets.
outputs.set("src/components/brand/onfire-logo.tsx", `// Generated from docs/assets/onfire-mark.svg by scripts/sync-brand.mjs.
import { cn } from "@/lib/utils";

interface OnFireLogoProps {
  className?: string;
  size?: number;
  label?: string;
}

export function OnFireLogo({ className, size = 32, label }: OnFireLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-onfire-logo
    >
      ${body.replaceAll("\n", "\n      ")}
    </svg>
  );
}
`);

const bannerPath = "docs/assets/banner.svg";
const banner = await readFile(resolve(root, bannerPath), "utf8");
const start = "<!-- onfire-mark:start -->";
const end = "<!-- onfire-mark:end -->";
if (!banner.includes(start) || !banner.includes(end)) {
  throw new Error("Missing OnFire mark region in the README banner");
}
outputs.set(bannerPath, banner.replace(
  /<!-- onfire-mark:start -->[\s\S]*?<!-- onfire-mark:end -->/,
  `${start}\n  <g transform="translate(68 62) scale(1.05)">\n    ${body.replaceAll("\n", "\n    ")}\n  </g>\n  ${end}`,
));

let stale = false;
for (const [relative, content] of outputs) {
  const target = resolve(root, relative);
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== content) { console.error(`Outdated brand asset: ${relative}`); stale = true; }
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
if (stale) process.exitCode = 1;
else console.log(`${process.argv.includes("--check") ? "Verified" : "Synced"} ${outputs.size} OnFire brand assets.`);
