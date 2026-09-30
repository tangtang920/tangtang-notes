export interface Note { id: string; title: string; content: string; updated: number }
export type Theme = 'light' | 'dark'
export interface Notebook { version: 1; notes: Note[]; theme: Theme }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export interface LoadInfo { data: Notebook; warning?: string }
export interface ImportInfo { notes: Note[] } // Preview only; the renderer merges its latest state.
export interface DesktopAPI {
  load(): Promise<Result<LoadInfo>>
  save(data: Notebook): Promise<Result<void>>
  importNotes(): Promise<Result<ImportInfo | null>>
  exportNotes(data: Notebook): Promise<Result<boolean>>
  onCommand(listener: (command: 'new' | 'search') => void): () => void
  onBeforeClose(listener: (token: string) => void): () => void
  onCloseCancelled(listener: () => void): () => void
  readyToClose(token: string): void
}

export function validateNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) throw new Error('笔记文件必须包含笔记数组')
  const ids = new Set<string>()
  return value.map(n => {
    if (!n || typeof n.id !== 'string' || !n.id || typeof n.title !== 'string' ||
        typeof n.content !== 'string' || !Number.isFinite(n.updated) || n.updated < 0 ||
        !Number.isFinite(new Date(n.updated).getTime())) {
      throw new Error('笔记格式无效：需要 id、title、content 和有效的 updated 时间')
    }
    if (ids.has(n.id)) throw new Error('笔记文件中存在重复 ID')
    ids.add(n.id)
    return { id: n.id, title: n.title, content: n.content, updated: n.updated }
  })
}

export function validateNotebook(value: unknown): Notebook {
  const v = value as Partial<Notebook> | null
  if (!v || v.version !== 1 || (v.theme !== 'light' && v.theme !== 'dark')) {
    throw new Error('不支持的备份版本或主题格式')
  }
  return { version: 1, notes: validateNotes(v.notes), theme: v.theme }
}

export function parseImport(raw: string): Note[] {
  const value: unknown = JSON.parse(raw)
  return Array.isArray(value) ? validateNotes(value) : validateNotebook(value).notes
}

export function mergeNotes(current: Note[], imported: Note[], uuid: () => string = () => crypto.randomUUID()):
  { notes: Note[]; added: number; skipped: number } {
  const notes = [...current]
  const used = new Set(notes.map(n => n.id))
  let added = 0, skipped = 0
  for (const incoming of imported) {
    const existing = notes.find(n => n.id === incoming.id)
    if (existing && existing.title === incoming.title && existing.content === incoming.content) {
      skipped++
      continue
    }
    let id = incoming.id
    if (used.has(id)) do { id = uuid() } while (used.has(id))
    notes.push({ ...incoming, id })
    used.add(id)
    added++
  }
  return { notes, added, skipped }
}

export const displayTitle = (note: Note) => note.title.trim() || '未命名笔记'
export const countWords = (content: string) => Array.from(content.replace(/\s/g, '')).length
export const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric'
})
export const searchNotes = (notes: Note[], query: string) => notes.filter(n =>
  (n.title + '\n' + n.content).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

export function initialNotebook(uuid: string, now: number): Notebook {
  return { version: 1, theme: 'light', notes: [{ id: uuid, updated: now,
    title: '把日子写成喜欢的样子',
    content: '欢迎来到糖糖笔记。\n\n这里是一个安静的小角落，收集灵感，整理思绪，也记录生活里那些微小的美好。\n\n你可以这样开始：\n\n  ✦  写下今天突然冒出的一个想法\n  ✦  记录一本书里打动你的句子\n  ✦  给明天的自己留一份小小的计划\n\n点击左侧「新建笔记」，开启一页新的故事。\n\n不必写得完美，开始就很好。'
  }] }
}
