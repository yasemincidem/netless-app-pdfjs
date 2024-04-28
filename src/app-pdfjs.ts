import type { NetlessApp, ReadonlyTeleBox, Room, WindowManager, Storage, AnimationMode } from '@netless/window-manager'

import { PDFViewer, type PDFViewerOptions } from './pdf-viewer'
import { disposableStore } from '@wopjs/disposable'
import styles from './style.scss?inline'

export { styles }

export type Logger = (...daga: any[]) => void

const createLogger = (room: Room | undefined): Logger => {
  if (room && (room as any).logger) {
    return (...args) => (room as any).logger.info(...args)
  } else {
    return (...args) => console.log(...args)
  }
}

export interface PDFjsAppAttributes {
  /** The static URL to the PDF file. */
  src: string
}

export interface PDFjsAppOptions extends Pick<PDFViewerOptions, "pdfjsLib" | "workerSrc" | "scale" | "hidpi" | "maxSize" | "previewScale"> {
  /** Disables user move / scale the PDF and whiteboard. */
  disableCameraTransform?: boolean
  /** Max scale = `maxCameraScale` * default scale. Not working when `disableCameraTransform` is true. Default: `3` */
  maxCameraScale?: number
  /** Custom logger. Default: a logger that reports to the whiteboard server. */
  readonly log?: Logger
}

const DefaultMaxCameraScale = 3

export class AppPDFViewer extends PDFViewer {
  log?: Logger
  box?: ReadonlyTeleBox
  scaleDocsToFit?: () => void
  syncPDFView?: () => void
  readonly jumpPage: (index: number) => void

  constructor(options: PDFViewerOptions & { jumpPage: (index: number) => void }) {
    super(options)
    this.jumpPage = options.jumpPage
  }

  override onNewPageIndex(index: number, origin: 'navigation' | 'keydown' | 'input' | 'preview'): void {
    if (origin === 'keydown' && this.box && !this.box.focus)
      return
    if (this.log)
      this.log(`[PDFjs]: user navigate to ${index + 1} (${origin})`)
    const length = this.numPages()
    if (0 <= index && index < length) {
      this.jumpPage(index)
    } else if (length === 0) {
      console.warn(`[PDFjs]: PDF is not ready, skip navigation`)
    } else {
      console.warn(`[PDFjs]: page index ${index} out of bounds [0, ${length - 1}]`)
    }
  }

  override onRenderEnd(): void {
    super.onRenderEnd()
    this.scaleDocsToFit && this.scaleDocsToFit()
    this.syncPDFView && this.syncPDFView()
  }

  override onRenderError(reason: unknown): void {
    super.onRenderError(reason)
    this.log && this.log(`[PDFjs]: render error ${reason}`)
  }
}

const createPDFViewer = (
  box: ReadonlyTeleBox,
  src: string,
  jumpPage: (index: number) => void,
  page$$: Storage<{ index: number }>,
  options: PDFjsAppOptions,
): AppPDFViewer => {
  box.mountStyles(styles)

  const app = new AppPDFViewer({ src, readonly: box.readonly, jumpPage, ...options })
  app.box = box
  box.mountContent(app.contentDOM)
  box.mountFooter(app.footerDOM)

  app.setPageIndex(page$$.state.index)
  app.dispose.add(page$$.addStateChangedListener(() => {
    app.setPageIndex(page$$.state.index)
  }))

  return app
}

export const NetlessAppPDFjs: NetlessApp<PDFjsAppAttributes, {}, PDFjsAppOptions, AppPDFViewer> = {
  kind: "PDFjs",
  setup(context) {
    const view = context.getView()
    if (!view)
      throw new Error("[PDFjs]: no whiteboard view, make sure you have added options.scenePath in addApp()")

    const src = context.storage.state.src
    if (!src)
      throw new Error("[PDFjs]: no PDF file URL, make sure you have set 'src' in addApp({ attributes: { src } })")

    const scenePath = context.getInitScenePath()!

    const options = context.getAppOptions() || {}
    let maxCameraScale = options.maxCameraScale ?? DefaultMaxCameraScale
    if (!(Number.isFinite(maxCameraScale) && maxCameraScale! > 0)) {
      console.warn(`[PDFjs] maxCameraScale should be a positive number, got ${options.maxCameraScale}`)
      maxCameraScale = DefaultMaxCameraScale
    }

    const log = options.log || createLogger(context.getRoom())
    log(`[PDFjs]: new ${context.appId} ${src}`)

    const dispose = disposableStore()
    dispose.add(() => log(`[PDFjs]: dispose ${context.appId}`))

    const page$$ = context.createStorage('page', { index: 0 })
    const view$$ = context.createStorage('view', { uid: "", originX: 0, originY: 0, width: 0, height: 0 })

    let lastIndex = -1
    const syncPage = async (index: number) => {
      if (lastIndex !== index) {
        lastIndex = index
        context.dispatchAppEvent('pageStateChange', { index, length: app.numPages() })
      }

      if (!context.getIsWritable()) return

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) return

      const name = String(index + 1)

      // "Prepare scenes" may not run correctly if the user suddenly disconnected after adding the app.
      // So here we add the missing pages again if not found. This is rare to happen.
      if (!scenes.some(scene => scene.name === name)) {
        await context.addPage({ scene: { name } })
      }

      // Switch to that page.
      await context.setScenePath(`${scenePath}/${name}`)
    }

    const jumpPage = (index: number): boolean => {
      if (!context.getIsWritable()) {
        console.warn('[PDFjs]: no permission, make sure you have test room.isWritable')
        return false
      }

      const pagesLength = app.numPages()
      if (!(0 <= index && index < pagesLength)) {
        if (pagesLength === 0) {
          console.warn(`[PDFjs]: PDF is not ready, skip page ${index + 1}`)
        } else {
          console.warn(`[PDFjs]: page ${index + 1} out of bounds [1, ${pagesLength}]`)
        }
        return false
      }

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) {
        console.warn(`[PDFjs]: no scenes found at ${scenePath}, make sure you have added options.scenePath in addApp()`)
        return false
      }

      const name = String(index + 1)
      if (!scenes.some(scene => scene.name === name)) {
        context.addPage({ scene: { name } })
      }

      page$$.setState({ index })
      return true
    }

    const scaleDocsToFit = () => {
      const { width, height } = app.size()
      if (width && height) {
        view.moveCameraToContain({
          originX: -width / 2, originY: -height / 2, width, height,
          animationMode: 'immediately' as AnimationMode.Immediately
        })
        const maxScale = view.camera.scale * (options.disableCameraTransform ? 1 : maxCameraScale)
        const minScale = view.camera.scale
        view.setCameraBound({
          damping: 1,
          maxContentMode: () => maxScale,
          minContentMode: () => minScale,
          centerX: 0, centerY: 0, width, height
        })
        syncViewFromRemote(true)
      }
    }

    const me = context.getRoom()?.uid || context.getDisplayer().observerId + ''

    let throttleSyncView = 0
    const syncView = () => {
      if (throttleSyncView > 0) return
      const { width, height } = app.size()
      if (width && height && context.getIsWritable()) {
        const { camera, size } = view
        const fixedW = Math.min(size.width, size.height * width / height)
        const fixedH = Math.min(size.height, size.width * height / width)
        const w = fixedW / camera.scale
        const h = fixedH / camera.scale
        const x = camera.centerX - w / 2
        const y = camera.centerY - h / 2
        throttleSyncView = setTimeout(() => {
          throttleSyncView = 0
          view$$.setState({ uid: me, originX: x, originY: y, width: w, height: h })
        }, 50)
      }
    }
    dispose.add(() => {
      clearTimeout(throttleSyncView)
      throttleSyncView = 0
    })

    const syncViewFromRemote = (force = false, animate = false) => {
      const { uid, originX, originY, width, height } = view$$.state
      if ((force || uid !== me) && width > 0 && height > 0) {
        view.moveCameraToContain({
          originX, originY, width, height,
          animationMode: (animate ? 'continuous' : 'immediately') as AnimationMode
        })
      }
    }

    let throttleSyncPDF = 0
    const syncPDFView = () => {
      if (throttleSyncPDF > 0) return
      throttleSyncPDF = requestAnimationFrame(() => {
        throttleSyncPDF = 0
        const intrinsic = app.size();
        if (intrinsic.width > 0 && intrinsic.height > 0) {
          const camera = view.camera
          const baseScale = Math.min(
            view.size.width / intrinsic.width,
            view.size.height / intrinsic.height
          )
          const scale = camera.scale / baseScale
          const x = -camera.centerX * baseScale
          const y = -camera.centerY * baseScale
          app.canvas.style.position = 'absolute'
          app.canvas.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`
        }
      })
    }
    dispose.add(() => {
      cancelAnimationFrame(throttleSyncPDF)
      throttleSyncPDF = 0
    })
    dispose.make(() => {
      view.callbacks.on('onCameraUpdated', syncPDFView)
      return () => view.callbacks.off('onCameraUpdated', syncPDFView)
    })

    const box = context.getBox()
    const app = dispose.add(createPDFViewer(box, src, jumpPage, page$$, options))
    app.contentDOM.dataset.appPdfjsVersion = __VERSION__
    app.scaleDocsToFit = scaleDocsToFit
    app.syncPDFView = syncPDFView
    app.log = log

    // Prepare scenes.
    if (context.isAddApp) app.ready.then(() => {
      const pagesLength = app.numPages()
      const room = context.getRoom()
      if (room && room.isWritable) {
        const scenes = room.entireScenes()[scenePath]
        if (scenes.length < pagesLength) {
          // Note: scenes with the same name will be overwritten.
          room.putScenes(scenePath, Array.from({ length: pagesLength }, (_, index) => ({ name: String(index + 1) })))
        }
      }
    })

    app.ready.then(() => {
      syncPage(page$$.state.index)
      dispose.add(page$$.addStateChangedListener(() => syncPage(page$$.state.index)))
      dispose.add(view$$.addStateChangedListener(() => syncViewFromRemote(false, true)))
    })

    context.mountView(app.whiteboardDOM)
    if (options.disableCameraTransform) {
      view.disableCameraTransform = true
    }
    dispose.make(() => {
      view.callbacks.on('onSizeUpdated', scaleDocsToFit)
      return () => view.callbacks.off('onSizeUpdated', scaleDocsToFit)
    })

    dispose.make(() => {
      view.callbacks.on('onCameraUpdatedByDevice', syncView)
      return () => view.callbacks.off('onCameraUpdatedByDevice', syncView)
    })
    syncViewFromRemote(true)

    dispose.add(context.emitter.on('writableChange', (isWritable) => {
      app.setReadonly(!isWritable)
      view.disableCameraTransform = !(isWritable && !options.disableCameraTransform)
    }))

    context.emitter.on('destroy', () => dispose())

    return app
  }
}

export interface InstallOptions {
  /**
   * Register as another app "kind". The default kind is "PDFjs".
   */
  as?: string
  /**
   * Options to customize the local app (not synced to others).
   */
  appOptions?: PDFjsAppOptions
}

export type RegisterFn = typeof WindowManager["register"]

/**
 * Call `register({ kind: "PDFjs", src: NetlessAppPDFjs })` to register this app.
 * Optionally accepts an options object to override the default kind.
 *
 * @example install(register, { as: "PDFViewer" })
 */
export const install = (register: RegisterFn, options: InstallOptions = {}) => {
  let app = NetlessAppPDFjs
  if (options.as) {
    app = Object.assign({}, app, { kind: options.as })
  }
  return register({ kind: app.kind, src: app, appOptions: options.appOptions })
}
