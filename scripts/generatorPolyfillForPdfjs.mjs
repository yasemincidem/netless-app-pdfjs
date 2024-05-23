import https from "https";
import fs from "node:fs";
import * as http from "node:http";

const polyfillCode = `
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
`

async function main() {
    // jsdelivr
    const libRes = await getFile("http://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.min.mjs");
    const workerRes = await getFile("http://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.worker.mjs");
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist')
    }
    fs.writeFileSync('dist/pdf.min.mjs', polyfillCode + libRes)
    fs.writeFileSync('dist/pdf.worker.min.js', polyfillCode + workerRes)
}

async function getFile(url) {
    return new Promise((resolve, reject) => {
        let data = '';
        const requestProtocol = url.startsWith('https') ? https : http;
        http.get(url, (res) => {
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            console.log('url', url)
            reject(err);
        });
    });

}



const timeLabel = "generator polyfill for pdfjs, only support Promise.WithResolvers"
console.time(timeLabel)
main().then(() => {
    console.timeEnd(timeLabel)
})