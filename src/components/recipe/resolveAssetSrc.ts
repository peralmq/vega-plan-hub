// Root-relative asset paths ("/recipes/mapo-tofu.webp", "/placeholder.svg")
// must be resolved against Vite's base: "/" on dev/Lovable but
// "/vega-plan-hub/" on GitHub Pages. Without this, locally re-hosted
// recipe images (p4-13) 404 on Pages — caught in Pelle's 2026-08-27 live
// review (imageless pool cards). External URLs pass through untouched.
export function resolveAssetSrc(src: string, base: string): string {
  if (!src.startsWith("/") || src.startsWith("//")) return src;
  return base.replace(/\/$/, "") + src;
}
