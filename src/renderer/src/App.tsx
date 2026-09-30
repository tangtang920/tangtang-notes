import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  countWords, displayTitle, formatDate, mergeNotes, searchNotes,
  type DesktopAPI, type Note, type Notebook, type Theme
} from '../../shared/model'

function NoteList({ notes, active, query, select }: {
  notes: Note[]; active: string | null; query: string; select: (id: string) => void
}) {
  const filtered = searchNotes(notes, query)
  return <nav id="list" aria-label="笔记列表">
    {filtered.map(n => <button key={n.id} className={'note' + (n.id === active ? ' active' : '')}
      aria-current={n.id === active} onClick={() => select(n.id)}>
      <strong>{displayTitle(n)}</strong><p>{n.content.trim() || '还没有内容，写点什么吧…'}</p>
      <small>{formatDate(n.updated)}</small>
    </button>)}
    {!filtered.length && <p className="no-results">{query.trim() ? '没有找到相关笔记' : '还没有笔记'}</p>}
  </nav>
}

function DataControls({ disabled, busy, onImport, onExport }: {
  disabled: boolean; busy: boolean; onImport: () => void; onExport: () => void
}) {
  return <div className="data-controls" aria-label="数据管理">
    <button disabled={disabled || busy} onClick={onImport}>导入笔记</button>
    <button disabled={disabled || busy} onClick={onExport}>导出备份</button>
  </div>
}

function Sidebar({ data, active, query, searchRef, disabled, busy, select, setQuery, create, setTheme, onImport, onExport }: {
  data: Notebook; active: string | null; query: string; searchRef: RefObject<HTMLInputElement | null>;
  disabled: boolean; busy: boolean; select: (id: string) => void; setQuery: (value: string) => void;
  create: () => void; setTheme: (theme: Theme) => void; onImport: () => void; onExport: () => void
}) {
  return <aside className="sidebar">
    <header className="brand"><span className="logo">▤</span><div>糖糖笔记<small>留住每一个灵感</small></div></header>
    <button className="primary" disabled={disabled} onClick={create}>＋ 新建笔记</button>
    <label className="search"><span>⌕</span><input ref={searchRef} type="search" placeholder="搜索笔记"
      aria-label="搜索笔记" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="list-heading"><span>全部笔记</span><span>{data.notes.length}</span></div>
    <NoteList notes={data.notes} active={active} query={query} select={select} />
    <DataControls disabled={disabled} busy={busy} onImport={onImport} onExport={onExport} />
    <div className="theme-control"><label htmlFor="theme">主题</label><select id="theme" aria-label="切换主题"
      disabled={disabled} value={data.theme} onChange={e => setTheme(e.target.value as Theme)}>
      <option value="light">☀ 浅色模式</option><option value="dark">☾ 深色模式</option>
    </select></div>
    <footer className="sidebar-footer"><span className="dot" /> 保存在此电脑 <span>LOCAL</span></footer>
  </aside>
}

function Editor({ note, titleRef, edit, disabled }: {
  note: Note | undefined; titleRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  edit: (field: 'title' | 'content', value: string) => void
}) {
  if (!note) return <section id="empty"><div className="empty-icon">▤</div><h1>给想法一个栖息地</h1>
    <p>点击「新建笔记」，开始你的第一篇记录。</p></section>
  return <section className="editor">
    <div className="eyebrow">自由记录 · 慢慢整理</div>
    <input disabled={disabled} ref={titleRef} className="title" placeholder="未命名笔记" aria-label="笔记标题" maxLength={200}
      value={note.title} onChange={e => edit('title', e.target.value)} />
    <div className="metadata"><span>编辑于 {formatDate(note.updated)}</span><span>·</span><span>{countWords(note.content)} 字</span></div>
    <div className="divider" />
    <textarea disabled={disabled} aria-label="笔记内容" placeholder="从这里开始，写下你的想法…" value={note.content}
      onChange={e => edit('content', e.target.value)} />
  </section>
}

function DeleteConfirmation({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} aria-labelledby="delete-heading" onCancel={e => { e.preventDefault(); cancel() }}>
    <h2 id="delete-heading">删除这篇笔记？</h2><p>删除后无法恢复。</p>
    <div className="dialog-actions"><button autoFocus onClick={cancel}>取消</button>
      <button className="danger" onClick={confirm}>删除笔记</button></div>
  </dialog>
}

const empty: Notebook = { version: 1, notes: [], theme: 'light' }

export function App({ api = window.desktop }: { api?: DesktopAPI }) {
  const [data, setData] = useState<Notebook>(empty)
  const draft = useRef(data)
  const [active, setActive] = useState<string | null>(null)
  const activeRef = useRef(active)
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [status, setStatus] = useState('正在加载…')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const mounted = useRef(true)

  const select = useCallback((id: string | null) => { activeRef.current = id; setActive(id) }, [])
  const persist = useCallback(async (next: Notebook) => {
    const current = ++revision.current
    setStatus('保存中…')
    try {
      const result = await api.save(next)
      if (!mounted.current || current !== revision.current) return
      if (!result.ok) throw new Error(result.error)
      setSaveError(''); setStatus('已保存')
    } catch (error) {
      if (!mounted.current || current !== revision.current) return
      setSaveError(String(error instanceof Error ? error.message : error)); setStatus('保存失败，请重试或导出备份')
    }
  }, [api])

  const commit = useCallback((next: Notebook) => {
    draft.current = next
    setData(next)
    void persist(next)
  }, [persist])

  const load = useCallback(async () => {
    setLoadError(''); setStatus('正在加载…')
    try {
      const result = await api.load()
      if (!mounted.current) return
      if (!result.ok) throw new Error(result.error)
      draft.current = result.value.data; setData(result.value.data)
      select(result.value.data.notes[0]?.id ?? null)
      loadedRef.current = true; setLoaded(true)
      setSaveError(result.value.warning ?? '')
      setStatus(result.value.warning ? '保存失败，请重试或导出备份' : '已保存')
    } catch (error) {
      if (!mounted.current) return
      setLoadError(String(error instanceof Error ? error.message : error)); setStatus('无法读取存储，原文件已保留')
    }
  }, [api, select])

  const create = useCallback(() => {
    if (!loadedRef.current || closingRef.current) return
    const n: Note = { id: crypto.randomUUID(), title: '', content: '', updated: Date.now() }
    commit({ ...draft.current, notes: [n, ...draft.current.notes] })
    select(n.id); setQuery('')
    requestAnimationFrame(() => titleRef.current?.focus())
  }, [commit, select])

  useEffect(() => {
    mounted.current = true
    void load()
    const stopCommand = api.onCommand(command => {
      if (command === 'new') create()
      else { searchRef.current?.focus(); searchRef.current?.select() }
    })
    const stopClose = api.onBeforeClose(token => {
      closingRef.current = true; setClosing(true); setDeleting(null)
      // Capture the ref, which is updated synchronously in every input handler.
      const pending = loadedRef.current ? persist(draft.current) : Promise.resolve()
      void pending.finally(() => api.readyToClose(token))
    })
    const stopCancel = api.onCloseCancelled(() => { closingRef.current = false; setClosing(false) })
    // Also handle renderer-origin keyboard events (e.g. accessibility tools).
    // Native events handled by Electron are prevented before reaching the renderer.
    const keydown = (event: KeyboardEvent) => {
      const primary = /Mac/.test(navigator.platform) ? event.metaKey : event.ctrlKey
      if (!primary || event.altKey || event.shiftKey || event.isComposing) return
      const key = event.key.toLowerCase()
      if (key === 'n' || key === 'f') {
        event.preventDefault()
        if (key === 'n') create()
        else { searchRef.current?.focus(); searchRef.current?.select() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { mounted.current = false; stopCommand(); stopClose(); stopCancel(); document.removeEventListener('keydown', keydown) }
  }, [api, load, create, persist])

  useEffect(() => { document.documentElement.dataset.theme = data.theme }, [data.theme])

  const edit = (field: 'title' | 'content', value: string) => commit({
    ...draft.current, notes: draft.current.notes.map(n => n.id === activeRef.current
      ? { ...n, [field]: value, updated: Date.now() } : n)
  })
  const remove = () => {
    const notes = draft.current.notes.filter(n => n.id !== deleting)
    commit({ ...draft.current, notes })
    if (activeRef.current === deleting) select(notes[0]?.id ?? null)
    setDeleting(null)
  }
  const onImport = async () => {
    setBusy(true); setNotice('')
    try {
      const result = await api.importNotes()
      if (!result.ok) throw new Error(result.error)
      if (!result.value) return
      if (closingRef.current) return
      const merged = mergeNotes(draft.current.notes, result.value.notes)
      if (merged.added) {
        commit({ ...draft.current, notes: merged.notes })
        if (!activeRef.current) select(merged.notes[0]?.id ?? null)
      }
      setNotice(`导入完成：新增 ${merged.added} 篇，跳过 ${merged.skipped} 篇`)
    } catch (error) { setNotice('导入失败：' + String(error instanceof Error ? error.message : error)) }
    finally { setBusy(false) }
  }
  const onExport = async () => {
    setBusy(true); setNotice('')
    try {
      const result = await api.exportNotes(draft.current)
      if (!result.ok) throw new Error(result.error)
      if (result.value) setNotice('备份已导出')
    } catch (error) { setNotice('导出失败：' + String(error instanceof Error ? error.message : error)) }
    finally { setBusy(false) }
  }
  const note = data.notes.find(n => n.id === active)
  return <>
    <Sidebar data={data} active={active} query={query} searchRef={searchRef} disabled={!loaded || closing} busy={busy}
      select={select} setQuery={setQuery} create={create} setTheme={theme => commit({ ...draft.current, theme })}
      onImport={() => void onImport()} onExport={() => void onExport()} />
    <main>
      <div className="toolbar"><span className="breadcrumb">我的笔记 <span>/</span> <span>{note ? displayTitle(note) : '全部笔记'}</span></span>
        <div><span id="status" role="status">{status}</span><button className="icon-button" aria-label="删除当前笔记"
          disabled={!note || closing} onClick={() => setDeleting(note?.id ?? null)}>删除</button></div></div>
      {loadError && <div className="message error" role="alert">{loadError}<button onClick={() => void load()}>重新读取</button></div>}
      {saveError && <div className="message error" role="alert">{saveError}<button onClick={() => void persist(draft.current)}>重试保存</button>
        <button disabled={busy} onClick={() => void onExport()}>导出备份</button></div>}
      {notice && <div className="message" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      {loaded && <Editor disabled={closing} note={note} titleRef={titleRef} edit={edit} />}
      {!loaded && !loadError && <p className="loading">正在读取笔记…</p>}
      <footer className="main-footer"><span>一点一滴，皆有意义。</span><span>糖糖笔记</span></footer>
    </main>
    {deleting && <DeleteConfirmation confirm={remove} cancel={() => setDeleting(null)} />}
  </>
}
