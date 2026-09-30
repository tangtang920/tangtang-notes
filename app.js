(() => {
  'use strict';
  const KEY = 'tangtang-notes-v1';
  const $ = id => document.getElementById(id);
  const date = timestamp => new Date(timestamp).toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric'});
  let notes = [], active = null, storageFailed = false;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(n => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.content === 'string' && Number.isFinite(n.updated))) throw new Error('Invalid data');
      notes = parsed;
    } else {
      notes = [{id:crypto.randomUUID(),title:'把日子写成喜欢的样子',content:'欢迎来到糖糖笔记。\n\n这里是一个安静的小角落，收集灵感，整理思绪，也记录生活里那些微小的美好。\n\n你可以这样开始：\n\n  ✦  写下今天突然冒出的一个想法\n  ✦  记录一本书里打动你的句子\n  ✦  给明天的自己留一份小小的计划\n\n点击左侧「新建笔记」，开启一页新的故事。\n\n不必写得完美，开始就很好。',updated:Date.now()}];
    }
  } catch { storageFailed = true; }
  active = notes[0]?.id ?? null;
  function save() {
    try { if (storageFailed) throw new Error('Storage unavailable'); localStorage.setItem(KEY, JSON.stringify(notes)); $('status').textContent = '已保存'; }
    catch { $('status').textContent = '保存失败，请复制备份'; }
  }
  function renderList() {
    $('count').textContent = notes.length;
    $('list').replaceChildren();
    const query = $('search').value.trim().toLocaleLowerCase();
    const filtered = notes.filter(n => (n.title+'\n'+n.content).toLocaleLowerCase().includes(query));
    for (const n of filtered) {
      const button = document.createElement('button');
      button.className = 'note' + (n.id === active ? ' active' : '');
      button.setAttribute('aria-current', n.id === active ? 'true' : 'false');
      const title = document.createElement('strong'), preview = document.createElement('p'), time = document.createElement('small');
      title.textContent = n.title.trim() || '未命名笔记';
      preview.textContent = n.content.trim() || '还没有内容，写点什么吧…';
      time.textContent = date(n.updated);
      button.append(title, preview, time);
      button.onclick = () => { active = n.id; render(); };
      $('list').append(button);
    }
    if (!filtered.length) { const p = document.createElement('p'); p.className='no-results'; p.textContent=query?'没有找到相关笔记':'还没有笔记'; $('list').append(p); }
  }
  function metadata(n) {
    $('crumb').textContent = n.title.trim() || '未命名笔记';
    $('date').textContent = '编辑于 ' + date(n.updated);
    $('words').textContent = Array.from(n.content.replace(/\s/g,'')).length + ' 字';
  }
  function render() {
    renderList();
    const n = notes.find(n => n.id === active);
    $('editor').hidden = !n; $('empty').hidden = !!n; $('delete').disabled = !n;
    if (n) { $('title').value = n.title; $('content').value = n.content; metadata(n); }
    else $('crumb').textContent = '全部笔记';
  }
  $('create').onclick = () => {
    const n = {id:crypto.randomUUID(),title:'',content:'',updated:Date.now()};
    notes.unshift(n); active=n.id; $('search').value=''; save(); render(); $('title').focus();
  };
  for (const field of ['title','content']) $(''+field).addEventListener('input', () => {
    const n = notes.find(n => n.id === active); if (!n) return;
    n[field] = $(field).value; n.updated=Date.now(); save(); renderList(); metadata(n);
  });
  $('search').addEventListener('input',renderList);
  let deleting = null;
  $('delete').onclick = () => { deleting=active; $('confirm').showModal(); };
  $('confirm').addEventListener('close', () => {
    if ($('confirm').returnValue !== 'delete') return;
    notes = notes.filter(n => n.id !== deleting);
    if (active === deleting) active = notes[0]?.id ?? null;
    save(); render();
  });
  render();
  if (storageFailed) $('status').textContent = '无法读取存储，请复制备份';
  else save();
})();
