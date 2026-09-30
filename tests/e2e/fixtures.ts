import { test as base, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export async function launch(directory: string, executablePath?: string): Promise<ElectronApplication> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] =>
    entry[1] !== undefined && !['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL'].includes(entry[0])))
  return _electron.launch({
    executablePath,
    args: executablePath ? [] : [resolve('out/main/index.js')],
    env: { ...env, TANGTANG_TEST_USER_DATA: directory },
    timeout: 30000
  })
}

interface Desktop {
  application: ElectronApplication
  page: Page
  directory: string
  restart(): Promise<void>
}
export const test = base.extend<{ desktop: Desktop }>({
  desktop: async ({}, use, testInfo) => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'tangtang-e2e-'))
    const errors: string[] = [], logs: string[] = []
    const application = await launch(directory)
    const page = await application.firstWindow()
    const desktop: Desktop = { application, page, directory, restart: async () => {
      await desktop.application.close()
      desktop.application = await launch(directory)
      desktop.page = await desktop.application.firstWindow()
      observe()
      await expect(desktop.page.getByRole('textbox', { name: '笔记标题' }).or(desktop.page.getByText('给想法一个栖息地'))).toBeVisible()
    } }
    function observe() {
      desktop.page.on('pageerror', error => errors.push(error.message))
      desktop.application.on('console', message => logs.push(message.text()))
    }
    observe()
    try {
      await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeVisible()
      await use(desktop)
      expect(errors, 'renderer uncaught errors').toEqual([])
    } finally {
      if (!desktop.page.isClosed() && testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('window', { body: await desktop.page.screenshot(), contentType: 'image/png' })
      }
      await testInfo.attach('electron-log', { body: logs.join('\n') + '\n' + errors.join('\n'), contentType: 'text/plain' })
      await desktop.application.close().catch(() => {})
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
})
export { expect }
