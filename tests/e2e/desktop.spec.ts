import { test, expect, launch } from './fixtures'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

test('新增、编辑、切换、搜索、纯文本、字数及重启恢复', async ({ desktop: d }) => {
  const { page } = d
  await page.getByRole('button', { name: '＋ 新建笔记' }).click()
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeFocused()
  await page.getByRole('textbox', { name: '笔记标题' }).fill('我的笔记')
  await page.getByRole('textbox', { name: '笔记内容' }).fill('你好\n A😀')
  await expect(page.getByText('4 字')).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: /把日子/ }).click()
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('把日子写成喜欢的样子')
  await page.getByRole('searchbox').fill('A😀')
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(1)
  await page.getByRole('navigation').getByRole('button', { name: /我的笔记/ }).click()
  await expect(page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('你好\n A😀')
  await page.getByRole('searchbox').fill('我的笔记')
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(1)
  await page.getByRole('searchbox').fill('不存在')
  await expect(page.getByText('没有找到相关笔记')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('你好\n A😀')
  await page.getByRole('textbox', { name: '笔记内容' }).fill('<script>window.hacked = true</script>')
  await page.getByRole('searchbox').fill('')
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false)
  await d.restart()
  await expect(d.page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('我的笔记')
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('<script>window.hacked = true</script>')
})

test('删除取消、Escape、确认、空列表重启和新建', async ({ desktop: d }) => {
  const { page } = d
  await page.getByRole('button', { name: '删除当前笔记' }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeVisible()
  await page.getByRole('button', { name: '删除当前笔记' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '删除当前笔记' }).click()
  await page.getByRole('button', { name: '删除笔记', exact: true }).click()
  await expect(page.getByText('给想法一个栖息地')).toBeVisible()
  await expect(page.getByRole('button', { name: '删除当前笔记' })).toBeDisabled()
  await d.restart()
  await expect(d.page.getByText('给想法一个栖息地')).toBeVisible()
  await d.page.getByRole('button', { name: '＋ 新建笔记' }).click()
  await expect(d.page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('')
})

test('主题恢复、窗口缩放、安全隔离与菜单快捷键', async ({ desktop: d }, testInfo) => {
  await d.page.screenshot({ path: testInfo.outputPath('light.png') })
  await d.page.getByRole('combobox').selectOption('dark')
  await expect(d.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await d.page.screenshot({ path: testInfo.outputPath('dark.png') })
  await d.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(460, 650))
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toBeVisible()
  expect(await d.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await d.page.screenshot({ path: testInfo.outputPath('narrow.png') })
  const preferences = await d.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents as Electron.WebContents & {
      getLastWebPreferences(): Electron.WebPreferences
    }
    return contents.getLastWebPreferences()
  })
  expect(preferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
  expect(await d.page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
  // Invoke the installed native menu action, then also verify the keyboard accelerator.
  await d.application.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find(item => item.label === '文件')!
    .submenu!.items.find(item => item.label === '新建笔记')!.click())
  await expect(d.page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('')
  await expect(d.page.getByRole('textbox', { name: '笔记标题' })).toBeFocused()
  await d.page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
  await expect(d.page.getByRole('searchbox')).toBeFocused()
  await d.restart()
  await expect(d.page.getByRole('combobox')).toHaveValue('dark')
})

test('JSON 导入合并、重复跳过、冲突保留、取消与导出往返', async ({ desktop: d }) => {
  const file = join(d.directory, 'import.json'), exported = join(d.directory, 'export.json')
  const original = JSON.parse(await fs.readFile(join(d.directory, 'notebook-v1.json'), 'utf8'))
  await fs.writeFile(file, JSON.stringify([original.notes[0], { ...original.notes[0], id: 'legacy', title: '旧笔记' }]))
  await d.application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, file)
  await d.page.getByRole('combobox').selectOption('dark')
  await d.page.getByRole('button', { name: '导入笔记', exact: true }).click()
  await expect(d.page.getByText('导入完成：新增 1 篇，跳过 1 篇')).toBeVisible()
  await fs.writeFile(file, JSON.stringify([{ ...original.notes[0], id: 'legacy', title: '冲突笔记' }]))
  await d.page.getByRole('button', { name: '导入笔记', exact: true }).click()
  await expect(d.page.getByText('导入完成：新增 1 篇，跳过 0 篇')).toBeVisible()
  await d.application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, exported)
  await d.page.getByRole('button', { name: '导出备份', exact: true }).click()
  await expect(d.page.getByText('备份已导出')).toBeVisible()
  const backup = JSON.parse(await fs.readFile(exported, 'utf8'))
  expect(backup.theme).toBe('dark')
  expect(backup.notes).toHaveLength(3)
  expect(new Set(backup.notes.map((n: { id: string }) => n.id)).size).toBe(3)
  await d.application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await d.page.getByRole('button', { name: '导入笔记', exact: true }).click()
  await expect(d.page.getByRole('navigation').getByRole('button')).toHaveCount(3)
  await fs.writeFile(file, '{broken')
  await d.application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, file)
  await d.page.getByRole('button', { name: '导入笔记', exact: true }).click()
  await expect(d.page.getByText(/^导入失败/)).toBeVisible()
  await expect(d.page.getByRole('navigation').getByRole('button')).toHaveCount(3)
  await d.restart()
  await expect(d.page.getByRole('navigation').getByRole('button')).toHaveCount(3)
})

test('快速连续输入后立即关闭窗口，重新打开恢复最新内容', async ({ desktop: d }) => {
  const text = '连续输入中文与 emoji 😀'.repeat(10)
  await d.page.getByRole('textbox', { name: '笔记内容' }).fill('')
  await d.page.getByRole('textbox', { name: '笔记内容' }).pressSequentially(text, { delay: 0 })
  const closed = d.page.waitForEvent('close')
  await d.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await closed
  const stored = JSON.parse(await fs.readFile(join(d.directory, 'notebook-v1.json'), 'utf8'))
  expect(stored.notes[0].content).toBe(text)
  await d.application.close().catch(() => {})
  d.application = await launch(d.directory)
  d.page = await d.application.firstWindow()
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toHaveValue(text)
})

test('写入失败保留草稿，关闭返回编辑，修复后重试保存', async ({ desktop: d }) => {
  const dataFile = join(d.directory, 'notebook-v1.json')
  await fs.rm(dataFile)
  await fs.mkdir(dataFile)
  await d.page.getByRole('textbox', { name: '笔记内容' }).fill('保存失败也不能丢失')
  await expect(d.page.locator('#status')).toContainText('保存失败')
  await d.application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  await d.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toBeEnabled()
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('保存失败也不能丢失')
  await fs.rm(dataFile, { recursive: true })
  await d.page.getByRole('button', { name: '重试保存' }).click()
  await expect(d.page.locator('#status')).toHaveText('已保存')
  await d.restart()
  await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('保存失败也不能丢失')
})

test('损坏文件启动不会覆盖原数据', async ({ desktop: d }) => {
  await d.application.close()
  const dataFile = join(d.directory, 'notebook-v1.json')
  await fs.writeFile(dataFile, '{broken')
  d.application = await launch(d.directory)
  d.page = await d.application.firstWindow()
  await expect(d.page.getByRole('alert')).toContainText('原文件已保留')
  await expect(d.page.getByRole('button', { name: '＋ 新建笔记' })).toBeDisabled()
  expect(await fs.readFile(dataFile, 'utf8')).toBe('{broken')
})

test('非预期窗口被阻止，非法保存数据不能修改文件', async ({ desktop: d }) => {
  const file = join(d.directory, 'notebook-v1.json')
  const previous = await fs.readFile(file, 'utf8')
  const result = await d.page.evaluate(() => window.desktop.save({ version: 2, notes: [], theme: 'light' } as unknown as import('../../src/shared/model').Notebook))
  expect(result.ok).toBe(false)
  expect(await fs.readFile(file, 'utf8')).toBe(previous)
  await d.page.evaluate(() => { window.open('https://example.com') })
  expect(d.application.windows()).toHaveLength(1)
})

test('重复启动聚焦已有窗口，macOS 关闭后可重新激活', async ({ desktop: d }) => {
  const env: NodeJS.ProcessEnv = { ...process.env, TANGTANG_TEST_USER_DATA: d.directory }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise<void>((resolveDone, reject) => {
    const child = spawn(d.application.process().spawnfile, [resolve('out/main/index.js')], { env, stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill(); reject(new Error('第二实例没有正常退出')) }, 10000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolveDone() : reject(new Error('第二实例退出码：' + code)) })
  })
  expect(d.application.windows()).toHaveLength(1)
  if (process.platform === 'darwin') {
    await d.page.getByRole('textbox', { name: '笔记内容' }).fill('关闭后重新打开')
    const closed = d.page.waitForEvent('close')
    await d.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await closed
    const reopened = d.application.waitForEvent('window')
    await d.application.evaluate(({ app }) => app.emit('activate'))
    d.page = await reopened
    await expect(d.page.getByRole('textbox', { name: '笔记内容' })).toHaveValue('关闭后重新打开')
  }
})

test('保存失败时明确放弃会退出进程', async ({ desktop: d }) => {
  const file = join(d.directory, 'notebook-v1.json')
  await fs.rm(file)
  await fs.mkdir(file)
  await d.page.getByRole('textbox', { name: '笔记内容' }).fill('明确放弃的草稿')
  await expect(d.page.locator('#status')).toContainText('保存失败')
  await d.application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 3, checkboxChecked: false })
  })
  const closed = d.application.waitForEvent('close')
  await d.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await closed
})
