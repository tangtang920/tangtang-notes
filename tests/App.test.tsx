// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/renderer/src/App'
import { initialNotebook, type DesktopAPI, type Notebook, type Result } from '../src/shared/model'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup(data = initialNotebook('welcome', 123)) {
  let saved = structuredClone(data)
  let beforeClose: (token: string) => void = () => {}
  let command: (value: 'new' | 'search') => void = () => {}
  const api: DesktopAPI = {
    load: vi.fn(async () => ({ ok: true as const, value: { data: saved } })),
    save: vi.fn(async next => { saved = structuredClone(next); return { ok: true as const, value: undefined } }),
    importNotes: vi.fn(async () => ({ ok: true as const, value: null })),
    exportNotes: vi.fn(async () => ({ ok: true as const, value: true })),
    onCommand: fn => { command = fn; return () => {} },
    onBeforeClose: fn => { beforeClose = fn; return () => {} },
    onCloseCancelled: () => () => {},
    readyToClose: vi.fn()
  }
  const view = render(<App api={api} />)
  return { api, view, saved: () => saved, close: (token: string) => beforeClose(token), command: (value: 'new' | 'search') => command(value) }
}
async function ready() { await screen.findByRole('textbox', { name: '笔记标题' }) }
const title = () => screen.getByRole('textbox', { name: '笔记标题' })
const content = () => screen.getByRole('textbox', { name: '笔记内容' })
const list = () => screen.getByRole('navigation', { name: '笔记列表' })

describe('React 核心功能', () => {
  it('新增编辑、字数、保存、切换和重启恢复', async () => {
    const app = setup(); await ready()
    await userEvent.click(screen.getByRole('button', { name: '＋ 新建笔记' }))
    fireEvent.change(title(), { target: { value: '我的笔记' } })
    fireEvent.change(content(), { target: { value: '你好\n A😀' } })
    await waitFor(() => expect(screen.getByText('4 字')).toBeInTheDocument())
    await screen.findByText('已保存')
    await userEvent.click(within(list()).getByRole('button', { name: /把日子/ }))
    expect(title()).toHaveValue('把日子写成喜欢的样子')
    await userEvent.click(within(list()).getByRole('button', { name: /我的笔记/ }))
    expect(content()).toHaveValue('你好\n A😀')
    const saved = app.saved(); app.view.unmount()
    setup(saved); await ready()
    expect(title()).toHaveValue('我的笔记')
    expect(content()).toHaveValue('你好\n A😀')
  })
  it('搜索标题正文与空结果，不改变当前编辑内容，新建清除搜索', async () => {
    setup(); await ready()
    fireEvent.change(title(), { target: { value: '测试标题' } })
    fireEvent.change(content(), { target: { value: '独特正文' } })
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: '独特正文' } })
    expect(within(list()).getAllByRole('button')).toHaveLength(1)
    fireEvent.change(search, { target: { value: '测试标题' } })
    expect(within(list()).getAllByRole('button')).toHaveLength(1)
    fireEvent.change(search, { target: { value: '不存在' } })
    expect(screen.getByText('没有找到相关笔记')).toBeInTheDocument()
    expect(content()).toHaveValue('独特正文')
    await userEvent.click(screen.getByRole('button', { name: '＋ 新建笔记' }))
    expect(search).toHaveValue('')
  })
  it('删除取消、Escape、确认、删空重启与重新创建', async () => {
    const app = setup(); await ready()
    await userEvent.click(screen.getByRole('button', { name: '删除当前笔记' }))
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(title()).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '删除当前笔记' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '删除当前笔记' }))
    await userEvent.click(screen.getByRole('button', { name: '删除笔记' }))
    expect(screen.getByText('给想法一个栖息地')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除当前笔记' })).toBeDisabled()
    await waitFor(() => expect(app.saved().notes).toEqual([]))
    app.view.unmount(); setup(app.saved())
    await screen.findByText('给想法一个栖息地')
    await userEvent.click(screen.getByRole('button', { name: '＋ 新建笔记' }))
    expect(title()).toHaveValue('')
  })
  it('脚本标签显示为纯文本，空标题有默认名称', async () => {
    setup(); await ready()
    fireEvent.change(title(), { target: { value: '' } })
    fireEvent.change(content(), { target: { value: '<script>alert(1)</script>' } })
    expect(within(list()).getByText('未命名笔记')).toBeInTheDocument()
    expect(within(list()).getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(list().querySelector('script')).toBeNull()
  })
  it('主题即时切换并保存，失败可重试且不丢笔记', async () => {
    const app = setup(); await ready()
    vi.mocked(app.api.save).mockResolvedValueOnce({ ok: false, error: '磁盘已满' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dark' } })
    expect(document.documentElement.dataset.theme).toBe('dark')
    await screen.findByText('磁盘已满')
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }))
    await screen.findByText('已保存')
    expect(app.saved().theme).toBe('dark')
    expect(app.saved().notes).toHaveLength(1)
    app.view.unmount(); setup(app.saved()); await ready()
    expect(screen.getByRole('combobox')).toHaveValue('dark')
  })
  it('加载失败禁用修改，重新读取恢复', async () => {
    const api: DesktopAPI = {
      load: vi.fn().mockResolvedValueOnce({ ok: false, error: '数据损坏' })
        .mockResolvedValueOnce({ ok: true, value: { data: initialNotebook('id', 0) } }),
      save: vi.fn(), importNotes: vi.fn(), exportNotes: vi.fn(),
      onCommand: () => () => {}, onBeforeClose: () => () => {}, onCloseCancelled: () => () => {}, readyToClose: vi.fn()
    }
    render(<App api={api} />)
    await screen.findByText('数据损坏')
    expect(screen.getByRole('button', { name: '＋ 新建笔记' })).toBeDisabled()
    expect(api.save).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '重新读取' }))
    await ready()
  })
  it('旧保存完成不会将最新待保存内容标记已保存，关闭握手提交最新草稿', async () => {
    const app = setup(); await ready()
    let resolveFirst!: (result: Result<void>) => void
    vi.mocked(app.api.save).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
    vi.mocked(app.api.save).mockResolvedValueOnce({ ok: false, error: '最新保存失败' })
    fireEvent.change(content(), { target: { value: 'first' } })
    fireEvent.change(content(), { target: { value: 'latest' } })
    await screen.findByText('最新保存失败')
    await act(async () => { resolveFirst({ ok: true, value: undefined }) })
    expect(screen.getByText('最新保存失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '删除当前笔记' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => { app.close('token') })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(content()).toBeDisabled()
    expect(app.api.save).toHaveBeenLastCalledWith(expect.objectContaining({ notes: [expect.objectContaining({ content: 'latest' })] }))
    expect(app.api.readyToClose).toHaveBeenCalledWith('token')
  })
  it('导入合并与去重，保留主题，导出最新内容，取消无修改', async () => {
    const app = setup({ ...initialNotebook('welcome', 1), theme: 'dark' }); await ready()
    vi.mocked(app.api.importNotes).mockResolvedValueOnce({ ok: true, value: {
      notes: [app.saved().notes[0], { id: 'import', title: '导入标题', content: '正文', updated: 1 }]
    } })
    await userEvent.click(screen.getByRole('button', { name: '导入笔记' }))
    await screen.findByText('导入完成：新增 1 篇，跳过 1 篇')
    expect(app.saved().notes).toHaveLength(2)
    expect(app.saved().theme).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: '导出备份' }))
    expect(app.api.exportNotes).toHaveBeenCalledWith(app.saved())
    const before = structuredClone(app.saved())
    await userEvent.click(screen.getByRole('button', { name: '导入笔记' }))
    expect(app.saved()).toEqual(before)
  })
  it('菜单命令可以新建并聚焦搜索', async () => {
    // Test the callback separately from OS-specific menu accelerators.
    const app = setup(); await ready()
    act(() => app.command('new'))
    expect(title()).toHaveValue('')
    act(() => app.command('search'))
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
  it('中文组合输入保留内容，组合期间快捷键不意外新建', async () => {
    const app = setup(); await ready()
    fireEvent.compositionStart(content())
    fireEvent.change(content(), { target: { value: '中文输入测试😀' } })
    fireEvent.keyDown(content(), { key: 'n', ctrlKey: true, isComposing: true })
    fireEvent.compositionEnd(content(), { data: '中文输入测试😀' })
    expect(content()).toHaveValue('中文输入测试😀')
    expect(within(list()).getAllByRole('button')).toHaveLength(1)
    await waitFor(() => expect(app.saved().notes[0].content).toBe('中文输入测试😀'))
  })
})
