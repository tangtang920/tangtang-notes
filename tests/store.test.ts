import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NotebookStore } from '../src/main/store'
import { mergeNotes, parseImport, type Notebook } from '../src/shared/model'

const directories: string[] = []
async function boot() {
  const directory = await fs.mkdtemp(join(tmpdir(), 'tangtang-store-'))
  directories.push(directory)
  const store = new NotebookStore(directory)
  const { data } = await store.load()
  return { store, directory, data }
}
afterEach(async () => { await Promise.all(directories.splice(0).map(d => fs.rm(d, { recursive: true, force: true }))) })
describe('本地文件存储', () => {
  it('首次启动创建欢迎笔记，之后空数据不被欢迎笔记替代', async () => {
    const { store, directory, data } = await boot()
    expect(data.notes).toHaveLength(1)
    await store.save({ ...data, notes: [], theme: 'dark' })
    expect((await new NotebookStore(directory).load()).data).toEqual({ version: 1, notes: [], theme: 'dark' })
  })
  it('连续保存保持顺序，备份是上一份有效内容，重启恢复最新内容', async () => {
    const { store, directory, data } = await boot()
    const snapshots = Array.from({ length: 20 }, (_, i): Notebook => ({
      ...data, notes: [{ ...data.notes[0], content: String(i) }]
    }))
    await Promise.all(snapshots.map(value => store.save(value)))
    await store.flush()
    expect((await new NotebookStore(directory).load()).data.notes[0].content).toBe('19')
    expect(JSON.parse(await fs.readFile(store.backup, 'utf8')).notes[0].content).toBe('18')
    expect((await fs.readdir(directory)).some(f => f.endsWith('.tmp'))).toBe(false)
  })
  it('损坏数据与无效结构不被覆盖，修复后可重新读取', async () => {
    const { store, directory, data } = await boot()
    await fs.writeFile(store.file, '{broken')
    const broken = new NotebookStore(directory)
    await expect(broken.load()).rejects.toThrow('原文件已保留')
    await expect(broken.save(data)).rejects.toThrow('禁止覆盖')
    expect(await fs.readFile(store.file, 'utf8')).toBe('{broken')
    await fs.writeFile(store.file, JSON.stringify(data))
    expect((await broken.load()).data).toEqual(data)
  })
  it('加载后外部损坏文件时也禁止覆盖', async () => {
    const { store, data } = await boot()
    await fs.writeFile(store.file, '[]')
    await expect(store.save(data)).rejects.toThrow('禁止覆盖')
    expect(await fs.readFile(store.file, 'utf8')).toBe('[]')
  })
  it('主文件丢失但备份存在时保护备份', async () => {
    const { store, directory, data } = await boot()
    await store.save(data)
    await fs.rm(store.file)
    await expect(new NotebookStore(directory).load()).rejects.toThrow('存在 .bak 备份')
    await expect(fs.access(store.file)).rejects.toThrow()
    expect(JSON.parse(await fs.readFile(store.backup, 'utf8'))).toEqual(data)
  })
  it('写入失败保留最新草稿，修复目录后可重试', async () => {
    const { directory, data } = await boot()
    const blockedDirectory = join(directory, 'blocked')
    const store = new NotebookStore(blockedDirectory)
    await store.load()
    // Replace the directory with a file to force ENOTDIR on all OSes, including root CI.
    await fs.rm(blockedDirectory, { recursive: true })
    await fs.writeFile(blockedDirectory, 'blocked')
    const changed = { ...data, theme: 'dark' as const }
    await expect(store.save(changed)).rejects.toThrow()
    await expect(store.flush()).rejects.toThrow()
    expect(store.snapshot()).toEqual(changed)
    await fs.rm(blockedDirectory)
    await store.retry()
    expect((await new NotebookStore(blockedDirectory).load()).data).toEqual(changed)
  })
  it('导出、解析、合并再保存的数据往返一致', async () => {
    const { store, directory, data } = await boot()
    const imported = parseImport(JSON.stringify(data))
    const merged = mergeNotes([], imported)
    await store.save({ ...data, notes: merged.notes })
    expect((await new NotebookStore(directory).load()).data).toEqual(data)
  })
})
