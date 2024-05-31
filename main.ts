import { styles, PDFViewer } from './src'

const test_files = [
  "https://cdn.jsdelivr.net/gh/mfogel/polygon-clipping/paper.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/%E6%96%B0%E6%9C%AC%E5%B8%81%E4%BA%A4%E6%98%93%E7%B3%BB%E7%BB%9F%E5%8A%9F%E8%83%BD%E4%BB%8B%E7%BB%8D-20230529V3.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/01a.%20Missing%20Number%20NOVEL%20App%20Check%20(M%2C%20W)_BrCa.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/test1.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/%E3%80%8A%E6%81%B0%E5%A6%82%E5%85%B6%E5%88%86%E7%9A%84%E5%AD%A4%E7%8B%AC%E3%80%8B%E8%83%A1%E6%85%8E%E4%B9%8B%E3%80%90%E6%96%87%E5%AD%97%E7%89%88_PDF%E7%94%B5%E5%AD%90%E4%B9%A6_%E9%9B%85%E4%B9%A6%E3%80%91.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/Manifest%20V3%E6%A6%82%E8%BF%B0.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/AWS%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88%E6%9E%B6%E6%9E%84%E5%B8%88%E5%AD%A6%E4%B9%A0%E4%B8%8E%E5%A4%87%E8%80%83_1.pdf",

  // (index = 7) 300+M PDF
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/Metal%20by%20Tutorials.pdf",

  // 300+M PDF with `qpdf --linearize`
  // ~> https://qpdf.readthedocs.io/en/stable/linearization.html
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/output_metal.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/output.pdf",
  "https://white-us-doc-convert-dev.oss-us-west-1.aliyuncs.com/test/797c2eb1aa734c9abbf40490123ffe20.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/output_hyper.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/output_ssjss.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/ssjss_222.pdf",
  "https://netless-whiteboard.oss-cn-hangzhou.aliyuncs.com/sourceFile/output_metal.pdf",
]

const index = 0

document.head.appendChild(document.createElement('style')).textContent = styles

const pdfViewer = globalThis.pdfViewer = new PDFViewer({
  prefix: "https://white-cover.oss-cn-hangzhou.aliyuncs.com/flat/",
  taskId: "b444a180c2f44a409a4d081e8f1a6d5f",
  urlInterrupter: (url: string) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(url)
      }, 1000)
    })
  }
})

document.querySelector('.wrapper')?.appendChild(pdfViewer.dom)
