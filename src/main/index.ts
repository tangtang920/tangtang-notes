import { app, BrowserWindow, Menu, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { NotebookStore, errorMessage } from './store'
import { parseImport, validateNotebook, type Notebook, type Result } from '../shared/model'

app.setName('糖糖笔记')
// Tests use an isolated directory; packaged normal launches keep a stable userData path.
if (process.env.TANGTANG_TEST_USER_DATA) app.setPath('userData', process.env.TANGTANG_TEST_USER_DATA)
const store = new NotebookStore(app.getPath('userData'))
const rendererFile = join(__dirname, '../renderer/index.html')
const rendererURL = process.env.ELECTRON_RENDERER_URL || pathToFileURL(rendererFile).href
let window: BrowserWindow | null = null
let closing = false, allowClose = false, quitRequested = false
let closeToken: string | null = null
let acknowledgeClose: (() => void) | null = null

function trusted(event: IpcMainInvokeEvent): boolean {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) return false
  const url = event.senderFrame?.url
  return !!url && (process.env.ELECTRON_RENDERER_URL
    ? new URL(url).origin === new URL(rendererURL).origin
    : url === rendererURL)
}

function handle<T>(channel: string, action: (event: IpcMainInvokeEvent, value: unknown) => Promise<T>): void {
  ipcMain.handle(channel, async (event, value): Promise<Result<T>> => {
    try {
      if (!trusted(event)) throw new Error('拒绝来自非应用页面的请求')
      return { ok: true, value: await action(event, value) }
    } catch (error) { return { ok: false, error: errorMessage(error) } }
  })
}

async function exportData(data: Notebook): Promise<boolean> {
  if (!window) throw new Error('窗口未就绪')
  const chosen = await dialog.showSaveDialog(window, {
    title: '导出笔记备份', defaultPath: '糖糖笔记备份.json',
    filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  })
  if (chosen.canceled || !chosen.filePath) return false
  // Never let a backup export overwrite the live notebook or its recovery file.
  if ([store.file, store.backup].includes(chosen.filePath)) throw new Error('请选择数据目录以外的备份文件')
  const temp = chosen.filePath + '.' + randomUUID() + '.tmp'
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 })
    await fs.rename(temp, chosen.filePath)
  } finally { await fs.rm(temp, { force: true }) }
  return true
}

handle('notes:load', () => store.load())
handle('notes:save', async (_event, value) => { await store.save(value) })
handle('notes:import', async () => {
  const chosen = await dialog.showOpenDialog(window!, {
    title: '导入笔记', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  })
  if (chosen.canceled || !chosen.filePaths[0]) return null
  return { notes: parseImport(await fs.readFile(chosen.filePaths[0], 'utf8')) }
})
handle('notes:export', (_event, value) => exportData(validateNotebook(value)))
ipcMain.on('app:ready-close', (event, token) => {
  if (window && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame &&
      token === closeToken) acknowledgeClose?.()
})

async function prepareClose(): Promise<void> {
  if (!window || window.webContents.isDestroyed()) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { acknowledgeClose = null; reject(new Error('编辑窗口未响应，请重试或导出已接收的笔记备份')) }, 10000)
    closeToken = randomUUID()
    acknowledgeClose = () => { clearTimeout(timer); acknowledgeClose = null; resolve() }
    window!.webContents.send('app:before-close', closeToken)
  })
  await store.flush()
}

async function closeSafely(): Promise<void> {
  if (closing || !window) return
  closing = true
  try {
    await prepareClose()
    allowClose = true
  } catch (error) {
    while (window && !allowClose) {
      const answer = await dialog.showMessageBox(window, {
        type: 'warning', title: '笔记尚未保存',
        message: '保存失败，最新编辑仍保留在内存中。', detail: errorMessage(error),
        buttons: ['返回编辑', '重试保存', '导出备份', '放弃未保存内容并退出'],
        defaultId: 0, cancelId: 0, noLink: true
      })
      if (answer.response === 0) break
      if (answer.response === 3) { allowClose = true; quitRequested = true; break }
      try {
        if (answer.response === 1) {
          await store.retry()
          await prepareClose()
          allowClose = true
        } else {
          const data = store.snapshot()
          if (data) await exportData(data)
        }
      } catch (retryError) { error = retryError }
    }
  } finally {
    closing = false
    closeToken = null
    if (allowClose) {
      if (quitRequested) app.quit()
      else window?.close()
    } else { quitRequested = false; window?.webContents.send('app:close-cancelled') }
  }
}

function createWindow(): void {
  allowClose = false
  window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 430, minHeight: 480,
    title: '糖糖笔记', show: false, backgroundColor: '#fcfcfa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('before-input-event', (event, input) => {
    const primary = process.platform === 'darwin' ? input.meta : input.control
    if (input.type === 'keyDown' && primary && !input.alt && !input.shift) {
      const key = input.key.toLowerCase()
      if (key === 'n' || key === 'f') { event.preventDefault(); command(key === 'n' ? 'new' : 'search') }
    }
  })
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.on('ready-to-show', () => window?.show())
  window.on('close', event => { if (!allowClose) { event.preventDefault(); void closeSafely() } })
  window.on('closed', () => { window = null })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(rendererURL)
  else void window.loadFile(rendererFile)
}

function command(action: 'new' | 'search'): void { window?.webContents.send('app:command', action) }

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (!window) createWindow()
    if (window?.isMinimized()) window.restore()
    window?.show(); window?.focus()
  })
  app.on('before-quit', event => {
    quitRequested = true
    if (window && !allowClose) { event.preventDefault(); void closeSafely() }
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { label: '文件', submenu: [
        { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => command('new') },
        { label: '搜索笔记', accelerator: 'CmdOrCtrl+F', click: () => command('search') },
        { type: 'separator' }, { role: 'close' }, { role: 'quit' }
      ] },
      { role: 'editMenu', label: '编辑' },
      { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
    ]))
    createWindow()
    app.on('activate', () => { if (!window) createWindow() })
  })
}
