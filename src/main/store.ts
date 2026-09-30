import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { initialNotebook, validateNotebook, type LoadInfo, type Notebook } from '../shared/model'

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'

// One writer, ordered snapshots, and atomic replacement of the current file.
export class NotebookStore {
  readonly file: string
  readonly backup: string
  private queue: Promise<void> = Promise.resolve()
  private blocked = true
  private draft?: Notebook
  private revision = 0
  private failure: string | null = null

  constructor(private directory: string) {
    this.file = join(directory, 'notebook-v1.json')
    this.backup = this.file + '.bak'
  }

  async load(): Promise<LoadInfo> {
    await this.queue
    if (this.draft && !this.blocked) return { data: structuredClone(this.draft), warning: this.failure ?? undefined }
    try {
      const data = validateNotebook(JSON.parse(await fs.readFile(this.file, 'utf8')))
      this.draft = data
      this.blocked = false
      this.failure = null
      return { data: structuredClone(data) }
    } catch (error) {
      if (!missing(error)) {
        this.blocked = true
        throw new Error('无法读取笔记，原文件已保留。请检查数据或恢复 .bak 备份。' + errorMessage(error))
      }
      // A missing primary with a surviving backup is not a new installation.
      try {
        await fs.access(this.backup)
        throw new Error('笔记文件缺失，但存在 .bak 备份。请先恢复备份，原文件不会被覆盖。')
      } catch (backupError) { if (!missing(backupError)) throw backupError }
      this.blocked = false
      const data = initialNotebook(randomUUID(), Date.now())
      this.draft = data
      try { await this.save(data); return { data } }
      catch (writeError) { return { data, warning: errorMessage(writeError) } }
    }
  }

  save(value: unknown): Promise<void> {
    if (this.blocked) return Promise.reject(new Error('存储未加载或已损坏，禁止覆盖原文件'))
    const data = validateNotebook(value)
    this.draft = data
    const revision = ++this.revision
    const task = this.queue.then(async () => {
      try {
        await this.write(data)
        if (revision === this.revision) this.failure = null
      } catch (error) {
        this.failure = errorMessage(error)
        throw error
      }
    })
    this.queue = task.catch(() => {})
    return task
  }

  async flush(): Promise<void> {
    await this.queue
    if (this.failure) throw new Error(this.failure)
  }

  async retry(): Promise<void> {
    if (!this.draft) throw new Error('没有可保存的数据')
    await this.save(this.draft)
  }

  snapshot(): Notebook | undefined { return this.draft && structuredClone(this.draft) }

  private async write(data: Notebook): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const temp = this.file + '.' + randomUUID() + '.tmp'
    const backupTemp = this.backup + '.' + randomUUID() + '.tmp'
    try {
      // Validate the previous file before updating its backup.
      let previous: string | undefined
      try {
        previous = await fs.readFile(this.file, 'utf8')
      } catch (error) {
        if (!missing(error)) {
          throw new Error('现有数据无法读取，禁止覆盖：' + errorMessage(error))
        }
      }
      if (previous !== undefined) {
        try { validateNotebook(JSON.parse(previous)) }
        catch (error) {
          this.blocked = true
          throw new Error('现有数据格式损坏，禁止覆盖：' + errorMessage(error))
        }
      }
      const handle = await fs.open(temp, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify(data, null, 2), 'utf8'); await handle.sync() }
      finally { await handle.close() }
      if (previous !== undefined) {
        await fs.writeFile(backupTemp, previous, { mode: 0o600 })
        await fs.rename(backupTemp, this.backup)
      }
      await fs.rename(temp, this.file)
    } finally {
      await Promise.all([fs.rm(temp, { force: true }), fs.rm(backupTemp, { force: true })])
    }
  }
}
