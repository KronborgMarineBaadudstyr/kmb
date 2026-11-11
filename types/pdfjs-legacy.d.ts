// pdf.js i browseren: den minificerede legacy-udgave virker med Next.js' bundler (den almindelige ESM-udgave
// giver "Object.defineProperty called on non-object"). Samme API og typer som pdf.mjs.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist/legacy/build/pdf.mjs'
}
