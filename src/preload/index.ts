import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from '../shared/model'

const api: DesktopAPI = {
  load: () => ipcRenderer.invoke('notes:load'),
  save: data => ipcRenderer.invoke('notes:save', data),
  importNotes: () => ipcRenderer.invoke('notes:import'),
  exportNotes: data => ipcRenderer.invoke('notes:export', data),
  onCommand: listener => {
    const handler = (_event: Electron.IpcRendererEvent, command: 'new' | 'search') => listener(command)
    ipcRenderer.on('app:command', handler)
    return () => ipcRenderer.removeListener('app:command', handler)
  },
  onBeforeClose: listener => {
    const handler = (_event: Electron.IpcRendererEvent, token: string) => listener(token)
    ipcRenderer.on('app:before-close', handler)
    return () => ipcRenderer.removeListener('app:before-close', handler)
  },
  readyToClose: token => ipcRenderer.send('app:ready-close', token),
  onCloseCancelled: listener => {
    const handler = () => listener()
    ipcRenderer.on('app:close-cancelled', handler)
    return () => ipcRenderer.removeListener('app:close-cancelled', handler)
  }
}
contextBridge.exposeInMainWorld('desktop', api)
