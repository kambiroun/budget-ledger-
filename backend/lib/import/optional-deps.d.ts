// Ambient declarations for optional deps used via dynamic import in
// lib/import/parsers.ts. If the packages aren't installed, parsing that
// format returns a friendly warning at runtime; the build just has to
// compile regardless.
//
// Installing them for real:
//   npm i xlsx pdfjs-dist
// will shadow these declarations with the actual types from the packages.

declare module "xlsx";
declare module "pdfjs-dist";
