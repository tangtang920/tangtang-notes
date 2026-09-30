import { describe, expect, it } from 'vitest'
import { countWords, displayTitle, mergeNotes, parseImport, searchNotes, validateNotebook, type Note } from '../src/shared/model'

const note: Note = { id: 'a', title: '测试标题', content: '独特正文', updated: 123 }
describe('笔记规则与迁移', () => {
  it('搜索标题、正文，忽略大小写与两端空格', () => {
    expect(searchNotes([note], '正文')).toEqual([note])
    expect(searchNotes([note], ' 测试 ')).toEqual([note])
    expect(searchNotes([{ ...note, title: 'ABC' }], 'abc')).toHaveLength(1)
    expect(searchNotes([note], '不存在')).toEqual([])
  })
  it('按 Unicode 字符统计非空白内容，空标题回退', () => {
    expect(countWords('你好\n A😀\t')).toBe(4)
    expect(displayTitle({ ...note, title: '  ' })).toBe('未命名笔记')
  })
  it('接受旧数组和版本化备份，拒绝非法字段、重复 ID 和版本', () => {
    expect(parseImport(JSON.stringify([note]))).toEqual([note])
    expect(parseImport(JSON.stringify({ version: 1, theme: 'dark', notes: [note] }))).toEqual([note])
    for (const value of [[{ ...note, content: null }], [note, note], [{ ...note, updated: -1 }], [{ ...note, updated: 1e20 }],
      { version: 2, notes: [note], theme: 'light' }, { version: 1, notes: [], theme: 'auto' }]) {
      expect(() => parseImport(JSON.stringify(value))).toThrow()
    }
    expect(() => parseImport('{broken')).toThrow()
  })
  it('合并去重，以新 ID 保留冲突笔记和原时间，不修改已有笔记', () => {
    const result = mergeNotes([note], [note, { ...note, id: 'b' }, { ...note, content: '改了' }], () => 'new')
    expect(result).toMatchObject({ added: 2, skipped: 1 })
    expect(result.notes.map(n => n.id)).toEqual(['a', 'b', 'new'])
    expect(result.notes[2].updated).toBe(123)
    expect(note.content).toBe('独特正文')
  })
  it('清洗额外字段，保留合法的空笔记集', () => {
    expect(validateNotebook({ version: 1, theme: 'light', notes: [], arbitrary: true }))
      .toEqual({ version: 1, theme: 'light', notes: [] })
  })
})
