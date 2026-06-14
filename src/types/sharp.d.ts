/**
 * Module declaration for sharp.
 *
 * sharp ships its types at `sharp/lib/index.d.ts` but its package.json
 * `exports` field does not include a `types` entry, so TypeScript's
 * moduleResolution "bundler" cannot resolve them automatically.
 *
 * This shim re-exports the sharp module type so the rest of the codebase
 * can `import sharp from "sharp"` with full type safety.
 */
// eslint-disable-next-line
declare module "sharp" {
  import sharp = require("sharp/lib/index");
  export = sharp;
}
