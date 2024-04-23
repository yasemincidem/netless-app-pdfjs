/// <reference types="vite/client" />
import { register, createFastboard, createUI } from '@netless/fastboard'
import { install } from '../src'

install(register, {
  appOptions: {
    scale: 1,
    hidpi: false,
  }
})

let fastboard = await createFastboard({
  sdkConfig: {
    appIdentifier: import.meta.env.VITE_APPID,
    region: 'cn-hz',
  },
  joinRoom: {
    uid: Math.random().toString(36).slice(2),
    uuid: import.meta.env.VITE_ROOM_UUID,
    roomToken: import.meta.env.VITE_ROOM_TOKEN,
  },
})
globalThis.fastboard = fastboard
fastboard.manager.onAppEvent('PDFjs', ev => {
  if (ev.type === 'pageStateChange')
    console.log('pageStateChange', ev.value, ev.appId)
})

fastboard.manager.emitter.on('appsChange', (apps: string[]) => {
  console.log('apps =', apps.length ? apps.join() : 'empty')
})

let ui = createUI(fastboard, document.querySelector('#whiteboard')!)
globalThis.ui = ui

document.querySelector<HTMLButtonElement>('#btn-add')!.onclick = async () => {
  let appId = await fastboard.manager.addApp({
    kind: 'PDFjs',
    options: {
      scenePath: '/pdf/polygon-clipping'
    },
    attributes: {
      src: 'https://cdn.jsdelivr.net/gh/mfogel/polygon-clipping/paper.pdf'
    },
  })
  console.log('new PDF appId =', appId)
}
