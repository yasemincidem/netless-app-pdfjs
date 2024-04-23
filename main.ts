import { styles, PDFViewer } from './src'

document.head.appendChild(document.createElement('style')).textContent = styles

const pdfViewer = globalThis.pdfViewer = new PDFViewer({
  src: 'https://cdn.jsdelivr.net/gh/mfogel/polygon-clipping/paper.pdf'
})

document.querySelector('.wrapper')?.appendChild(pdfViewer.dom)
