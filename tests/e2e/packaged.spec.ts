import { test, expect, type ElectronApplication } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { launch } from './fixtures'

async function executable(): Promise<string> {
  if (process.env.TANGTANG_PACKAGED_EXECUTABLE) return resolve(process.env.TANGTANG_PACKAGED_EXECUTABLE)
  const folder = process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac')
    : process.platform === 'win32' ? 'win-unpacked' : 'linux-unpacked'
  const binary = process.platform === 'darwin' ? '糖糖笔记.app/Contents/MacOS/糖糖笔记'
    : process.platform === 'win32' ? '糖糖笔记.exe' : 'tangtang-notes'
  return resolve('dist', folder, binary)
}

test('打包应用离线启动、保存与重启恢复', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'tangtang-packaged-'))
  const binary = await executable()
  await fs.access(binary)
  let app: ElectronApplication | undefined
  try {
    app = await launch(directory, binary)
    let page = await app.firstWindow()
    await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeVisible()
    await page.getByRole('button', { name: '＋ 新建笔记' }).click()
    await page.getByRole('textbox', { name: '笔记标题' }).fill('安装包验证')
    await page.getByRole('textbox', { name: '笔记内容' }).fill('离线客户端持久化正常😀')
    await page.getByRole('combobox').selectOption('dark')
    await page.screenshot({ path: testInfo.outputPath('packaged.png') })
    await app.close()
    app = await launch(directory, binary)
    page = await app.firstWindow()
    await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('安装包验证')
    await expect(page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('离线客户端持久化正常😀')
    await expect(page.getByRole('combobox')).toHaveValue('dark')
  } catch (error) {
    const pages = app?.windows() ?? []
    if (pages[0] && !pages[0].isClosed()) await testInfo.attach('packaged-failure', {
      body: await pages[0].screenshot(), contentType: 'image/png'
    })
    throw error
  } finally {
    await app?.close().catch(() => {})
    await fs.rm(directory, { recursive: true, force: true })
  }
})
