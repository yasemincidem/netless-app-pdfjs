import fs from "node:fs";

const polyfill = `
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
`.trimStart()

console.time('Download and patch polyfill')

const main = fetch("https://unpkg.com/pdfjs-dist@latest/build/pdf.min.mjs").then(r => r.text());
const worker = fetch("https://unpkg.com/pdfjs-dist@latest/build/pdf.worker.min.mjs").then(r => r.text());

fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync('dist/pdf.min.mjs', polyfill + await main)
fs.writeFileSync('dist/pdf.worker.min.js', polyfill + await worker)

console.timeEnd('Download and patch polyfill')
