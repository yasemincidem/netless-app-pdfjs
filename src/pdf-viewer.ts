import { disposableStore, type IDisposable } from '@wopjs/disposable'
import { listen } from '@wopjs/dom'
import { seq } from '@wopjs/async-seq'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { arrowLeftSVG, arrowRightSVG, sidebarSVG } from './icons'

type PDFjsModule = typeof import('pdfjs-dist')
type GetDocument = PDFjsModule['getDocument']

export interface PDFViewerOptions {
  /** The static URL to the PDF file. */
  readonly src: Parameters<GetDocument>[0]
  /** URL to load the PDF.js lib, default is `"https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.min.mjs"`. */
  readonly pdfjsLib?: string
  /** URL to load the PDF.js worker, default is `"https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.worker.min.mjs"`. */
  readonly workerSrc?: string
  /** Default is `1.5`. */
  readonly scale?: number
  /**
   * Whether to multiply [`devicePixelRatio`](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) on `scale`, default is `true`.
   * If set as a number, the final scale will be `Math.min(hidpi, devicePixelRatio) * scale`.
   */
  readonly hidpi?: boolean | number
  /** Max rendering page size in pixels, default is no limit. If set, all pages will be shrinked to let the biggest page fit this size.  */
  readonly maxSize?: { readonly width: number, readonly height: number } | null
  /** Multiplies `scale` to render the preview pages. Default is `0.2`. */
  readonly previewScale?: number
  /** Readonly mode (disable footer), default is `false`. */
  readonly readonly?: boolean
  /** Callback to receive render errors. */
  readonly onRenderError?: (reason: unknown) => void
}

function inferWorkerSrc(pdfjsLib: string): string {
  let index = pdfjsLib.lastIndexOf('/pdf.')
  if (index >= 0) {
    return pdfjsLib.slice(0, index) + '/pdf.worker.' + pdfjsLib.slice(index + 5)
  }
  return 'https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.worker.min.mjs'
}

function load(lib: string): Promise<PDFjsModule> {
  return Promise.resolve(globalThis.pdfjsLib || import(/* @vite-ignore */ lib))
}

type Transform = [scaleX: number, skewY: number, skewX: number, scaleY: number, translateX: number, translateY: number]

function calcTransform(hidpi: boolean | number): Transform | undefined {
  if (hidpi) {
    let base = globalThis.devicePixelRatio || 1
    let scale = typeof hidpi === 'number' ? Math.min(hidpi, base) : base
    if (scale > 0 && scale !== 1) return [scale, 0, 0, scale, 0, 0]
  }
}

function block(): [promise: Promise<void>, resolve: () => void] {
  let resolve: () => void
  let promise = new Promise<void>(r => { resolve = r })
  return [promise, resolve!]
}

interface PreviewLazyLoadOptions {
  container: HTMLElement
  elements_selector: string
  touch(element: Element | null): void
}

class PreviewLazyLoad {
  observer: IntersectionObserver
  constructor(readonly options: PreviewLazyLoadOptions) {
    this.observer = new IntersectionObserver(this.handler.bind(this), { root: options.container })
    const elements = this.options.container.querySelectorAll(this.options.elements_selector)
    elements.forEach(element => this.observer.observe(element))
  }
  handler(entries: IntersectionObserverEntry[]) {
    entries.forEach(entry => {
      if (entry.isIntersecting || entry.intersectionRatio > 0)
        this.options.touch(entry.target)
    })
  }
  destroy() {
    this.observer.disconnect()
  }
}

export class PDFViewer implements IDisposable<void> {
  readonly options: Required<PDFViewerOptions>
  readonly pdfjsLib: Promise<PDFjsModule>
  readonly ready: Promise<void>

  readonly namespace = "netless-app-pdfjs"
  readonly dispose = disposableStore()
  readonly rendering = seq()

  destroyed = false
  getDocumentTask: ReturnType<GetDocument> | null = null
  pdf: PDFDocumentProxy | null = null
  lastRenderingTask: RenderTask | null = null
  /** The actual `scale` shrinked by `options.maxSize`. Only valid after `ready`. */
  scale: number
  pdfjs: PDFjsModule | null = null

  dom: Element | DocumentFragment
  contentDOM: HTMLDivElement
  previewDOM: HTMLDivElement
  pageDOM: HTMLDivElement
  canvas: HTMLCanvasElement
  whiteboardDOM: HTMLDivElement
  footerDOM: HTMLDivElement
  totalPageDOM: HTMLSpanElement
  pageNumberInputDOM: HTMLInputElement

  readonly: boolean
  showPreview = false
  previewLazyLoad: PreviewLazyLoad | null = null
  touched: { [page: number]: true } = Object.create(null)
  pageIndex = 0

  constructor(options: PDFViewerOptions) {
    const pdfjsLib = options.pdfjsLib || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/build/pdf.min.mjs'
    const workerSrc = options.workerSrc || inferWorkerSrc(pdfjsLib)
    this.options = Object.assign(
      { scale: 1.5, previewScale: 0.2, hidpi: true, readonly: false },
      options as typeof this.options,
      { pdfjsLib, workerSrc },
    )
    this.scale = this.options.scale
    this.readonly = this.options.readonly

    const [ready, resolve] = block()
    this.ready = ready

    this.pdfjsLib = load(this.options.pdfjsLib)
    this.pdfjsLib.then(pdfjs => {
      if (this.destroyed) return
      this.pdfjs = pdfjs
      pdfjs.GlobalWorkerOptions.workerSrc = this.options.workerSrc
      this.getDocumentTask = pdfjs.getDocument(this.options.src)
      this.getDocumentTask.promise.then(this.onLoad.bind(this, resolve), this.onError.bind(this))
      this.contentDOM.dataset.pdfjs = [pdfjs.version, pdfjs.build].join(' ')
    })
    this.pdfjsLib.catch(this.onError.bind(this))

    this.dispose.add(() => {
      this.destroyed = true
      this.previewLazyLoad?.destroy()
      this.previewLazyLoad = null
      this.getDocumentTask?.destroy()
      this.getDocumentTask = null
      this.lastRenderingTask?.cancel()
      this.lastRenderingTask = null
    })

    this.dom = document.createElement('div')
    this.dom.className = this.namespace

    this.contentDOM = document.createElement('div')
    this.contentDOM.className = this.c('content')

    const previewMask = this.contentDOM.appendChild(document.createElement('div'))
    previewMask.className = this.c('preview-mask')
    this.dispose.add(listen(previewMask, "click", ev => {
      if (this.readonly) return
      if (ev.target == previewMask) {
        this.togglePreview(false)
      }
    }))

    this.previewDOM = document.createElement('div')
    this.previewDOM.className = this.c('preview')
    this.previewDOM.classList.add('tele-fancy-scrollbar')
    this.contentDOM.appendChild(this.previewDOM)
    this.dispose.add(listen(this.previewDOM, "click", ev => {
      const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex
      if (pageIndex) {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation()
        this.onNewPageIndex(Number(pageIndex), 'preview')
        this.togglePreview(false)
      }
    }))
    ready.then(() => {
      if (this.destroyed) return
      this.makePreview()
    })

    this.pageDOM = document.createElement('div')
    this.pageDOM.className = this.c('page')

    this.canvas = document.createElement('canvas')

    this.whiteboardDOM = document.createElement('div')
    this.whiteboardDOM.className = this.c('wb-view')

    this.footerDOM = document.createElement('div')
    this.footerDOM.className = this.c('footer')

    this.totalPageDOM = document.createElement('span')
    this.totalPageDOM.className = this.c('total-page')

    this.pageNumberInputDOM = document.createElement('input')
    this.pageNumberInputDOM.className = this.c('page-number-input')

    this.contentDOM.classList.toggle(this.c('readonly'), this.readonly)
    this.dom.appendChild(this.contentDOM)

    this.pageDOM.appendChild(this.canvas)
    this.contentDOM.appendChild(this.pageDOM)
    this.contentDOM.appendChild(this.whiteboardDOM)

    this.footerDOM.classList.toggle(this.c('readonly'), this.readonly)
    this.dom.appendChild(this.footerDOM)

    const btnSidebar = document.createElement('button')
    btnSidebar.className = `${this.c('footer-btn')} ${this.c('btn-sidebar')}`
    btnSidebar.appendChild(sidebarSVG(this.namespace))
    this.footerDOM.appendChild(btnSidebar)
    this.dispose.add(listen(btnSidebar, "click", () => {
      if (this.readonly) return
      this.togglePreview()
    }))

    const pageJumps = document.createElement('div')
    pageJumps.className = this.c('page-jumps')
    this.footerDOM.appendChild(pageJumps)

    const btnPageBack = document.createElement('button')
    btnPageBack.className = `${this.c('footer-btn')} ${this.c('btn-page-back')}`
    btnPageBack.appendChild(arrowLeftSVG(this.namespace))
    pageJumps.appendChild(btnPageBack)
    this.dispose.add(listen(btnPageBack, 'click', () => {
      if (this.readonly) return
      if (this.pageIndex > 0) this.onNewPageIndex(this.pageIndex - 1, 'navigation')
    }))

    const btnPageNext = document.createElement('button')
    btnPageNext.className = `${this.c('footer-btn')} ${this.c('btn-page-next')}`
    btnPageNext.appendChild(arrowRightSVG(this.namespace))
    pageJumps.appendChild(btnPageNext)
    this.dispose.add(listen(btnPageNext, 'click', () => {
      if (this.readonly) return
      const pagesLength = this.pdf?.numPages || 0
      if (this.pageIndex < pagesLength - 1) this.onNewPageIndex(this.pageIndex + 1, 'navigation')
    }))

    const pageNumber = document.createElement('div')
    pageNumber.className = this.c('page-number')
    this.footerDOM.appendChild(pageNumber)

    pageNumber.appendChild(this.pageNumberInputDOM)
    this.pageNumberInputDOM.value = String(this.pageIndex + 1)
    this.dispose.add(listen(this.pageNumberInputDOM, 'focus', () => {
      if (this.readonly) return
      this.pageNumberInputDOM.select()
    }))
    this.dispose.add(listen(this.pageNumberInputDOM, 'change', () => {
      if (this.readonly) return
      if (this.pageNumberInputDOM.value) {
        this.onNewPageIndex(Number(this.pageNumberInputDOM.value) - 1, 'input')
      }
    }))

    this.totalPageDOM.textContent = '…'
    pageNumber.appendChild(this.totalPageDOM)

    this.dispose.add(listen(window, 'keydown', ev => {
      if (this.readonly || this.isEditable(ev.target)) return
      if (ev.key == 'ArrowUp' || ev.key == 'ArrowLeft')
        this.onNewPageIndex(this.pageIndex - 1, 'keydown')
      else if (ev.key == 'ArrowDown' || ev.key == 'ArrowRight')
        this.onNewPageIndex(this.pageIndex + 1, 'keydown')
    }))

    ready.then(this.refresh.bind(this))
  }

  setDOM(dom: Element | DocumentFragment) {
    if (this.dom == dom) return
    dom.appendChild(this.contentDOM)
    dom.appendChild(this.footerDOM)
    this.dom = dom
  }

  setReadonly(readonly: boolean) {
    if (this.readonly == readonly) return
    this.contentDOM.classList.toggle(this.c('readonly'), readonly)
    this.footerDOM.classList.toggle(this.c('readonly'), readonly)
    this.pageNumberInputDOM.disabled = readonly
    this.readonly = readonly
  }

  setPageIndex(pageIndex: number) {
    if (Number.isSafeInteger(pageIndex)) {
      this.pageIndex = pageIndex
      this.pageNumberInputDOM.value = String(pageIndex + 1)
      this.refresh()
    }
  }

  onNewPageIndex(index: number, _origin: "navigation" | "keydown" | "input" | "preview") {
    if (0 <= index && index < (this.pdf?.numPages || 0)) {
      this.setPageIndex(index)
    }
  }

  page(): Promise<PDFPageProxy> | undefined {
    return this.pdf?.getPage(this.pageIndex + 1)
  }

  size(): { width: number, height: number } {
    const viewport = this.canvas.dataset.viewport || '0,0'
    const [width = 0, height = 0] = viewport.split(',').map(e => Number(e))
    return { width, height }
  }

  numPages(): number {
    return this.pdf?.numPages || 0
  }

  togglePreview(show?: boolean) {
    this.showPreview = show ?? !this.showPreview
    this.contentDOM.classList.toggle(this.c('preview-active'), this.showPreview)
    if (this.showPreview) {
      const previewPageDOM = this.previewDOM.querySelector<HTMLElement>('.' + this.c(`preview-page-${this.pageIndex}`))
      if (previewPageDOM) {
        this.previewLazyLoad ||= new PreviewLazyLoad({
          container: this.previewDOM,
          elements_selector: `.${this.c('preview-page>canvas')}`,
          touch: async (canvas: HTMLCanvasElement) => {
            const pageNumber = +(canvas.dataset.pageIndex || 0) + 1
            if (this.touched[pageNumber]) return
            this.touched[pageNumber] = true
            await this.render(pageNumber, canvas, this.scale * this.options.previewScale)
          }
        })
        this.previewDOM.scrollTo({ top: previewPageDOM.offsetTop - 16 })
      }
    }
  }

  refresh() {
    if (this.destroyed) return
    const page = this.page()
    if (!page) {
      const context = this.canvas.getContext('2d')
      context && context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    const pagesLength = this.pdf?.numPages || 0
    this.totalPageDOM.textContent = pagesLength > 0 ? ` / ${pagesLength}` : '…'
    this.onRenderStart()
    this.render(this.pageIndex + 1, this.canvas)
      .then(this.onRenderEnd.bind(this))
      .catch(this.onRenderError.bind(this))
  }

  onLoad(done: () => void, pdf: PDFDocumentProxy) {
    if (this.destroyed) return
    this.pdf = pdf
    this.getDocumentTask = null

    if (this.options.maxSize) {
      let maxSize = this.options.maxSize
      let minScale = this.scale
      let promises: Promise<void>[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        promises.push(pdf.getPage(i).then(page => {
          let { width, height } = page.getViewport({ scale: 1 })
          if (width === 0 || height === 0) return
          minScale = Math.min(minScale, maxSize.width / width)
          minScale = Math.min(minScale, maxSize.height / height)
        }))
      }
      Promise.allSettled(promises).then(() => {
        this.scale = minScale
        done()
      })
    } else {
      done()
    }
  }

  // Either the PDF.js lib or getDocument() failed to load.
  onError(reason: unknown) {
    this.options.onRenderError?.(reason)
    console.error(reason)
    this.dispose()
  }

  onRenderStart() {
  }

  onRenderEnd() {
  }

  onRenderError(reason: unknown) {
    if (('' + reason).includes('RenderingCancelledException')) return
    console.warn(reason)
    this.options.onRenderError?.(reason)
  }

  async makePreview() {
    await this.ready
    let pdf = this.pdf
    if (!pdf) throw new Error('PDF not loaded.')

    const c_previewPage = this.c('preview-page')
    const c_previewPageName = this.c('preview-page-name')
    for (let index = 0; index < pdf.numPages; index++) {
      const page = await pdf.getPage(index + 1)
      const viewport = page.getViewport({ scale: this.scale * this.options.previewScale })

      const previewPage = document.createElement('a')
      previewPage.className = `${c_previewPage} ${this.c(`preview-page-${index}`)}`
      previewPage.setAttribute('href', '#')
      previewPage.dataset.pageIndex = String(index)

      const canvas = document.createElement('canvas')
      const transform = calcTransform(this.options.hidpi)
      const ratio = transform ? transform[0] : 1
      canvas.width = viewport.width * ratio
      canvas.height = viewport.height * ratio
      canvas.dataset.pageIndex = String(index)

      const name = document.createElement('span')
      name.className = c_previewPageName
      name.textContent = String(index + 1)
      name.dataset.pageIndex = String(index)

      previewPage.appendChild(canvas)
      previewPage.appendChild(name)
      this.previewDOM.appendChild(previewPage)
    }
  }

  async render(pageNumber: number, canvas = document.createElement('canvas'), scale = this.scale): Promise<void> {
    return this.rendering.add(() => this.render_(pageNumber, canvas, scale))
  }

  async render_(pageNumber: number, canvas = document.createElement('canvas'), scale = this.scale): Promise<void> {
    await this.ready
    let pdf = this.pdf
    if (!pdf) throw new Error('PDF not loaded.')
    if (!(1 <= pageNumber && pageNumber <= pdf.numPages))
      throw new Error(`Invalid page number, expecting 1..${pdf.numPages}, got ${pageNumber}.`)
    let page = await pdf.getPage(pageNumber)
    let viewport = page.getViewport({ scale })
    let transform = calcTransform(this.options.hidpi)
    let ratio = transform ? transform[0] : 1
    canvas.width = viewport.width * ratio
    canvas.height = viewport.height * ratio
    canvas.dataset.viewport = [viewport.width, viewport.height].join()
    let context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create canvas 2d context.')
    this.lastRenderingTask?.cancel()
    this.lastRenderingTask = page.render({ canvasContext: context, viewport, transform })
    await this.lastRenderingTask.promise
    this.lastRenderingTask = null
  }

  private c(className: string): string {
    return `${this.namespace}-${className}`
  }

  private isEditable(el: EventTarget | null): boolean {
    if (!el) return false
    const { tagName } = el as HTMLElement
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
  }
}
