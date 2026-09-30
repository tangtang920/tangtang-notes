const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
function boot(saved, failWrite=false) {
  class Element {
    constructor() { this.value=''; this.children=[]; this.listeners={}; this.hidden=false; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren() { this.children=[]; }
    setAttribute(name,value) { this[name]=value; }
    addEventListener(name,fn) { this.listeners[name]=fn; }
    focus() {}
    showModal() { this.open=true; }
    fire(name) { this.listeners[name]?.(); }
  }
  const elements = Object.fromEntries(['create','search','count','list','title','content','status','crumb','date','words','editor','empty','delete','confirm'].map(id=>[id,new Element()]));
  let data=saved, id=0;
  const context={document:{getElementById:id=>elements[id],createElement:()=>new Element()},localStorage:{getItem:()=>data??null,setItem:(key,value)=>{if(failWrite)throw Error('Quota');data=value;}},crypto:{randomUUID:()=>String(++id)},Date,console};
  vm.runInNewContext(source,context);
  return {e:elements,data:()=>data,edit:(field,value)=>{elements[field].value=value;elements[field].fire('input');},remove:()=>{elements.delete.onclick();elements.confirm.returnValue='delete';elements.confirm.fire('close');}};
}
test('新增、编辑、字数和刷新恢复',()=>{
  const app=boot(); app.e.create.onclick(); app.edit('title','我的笔记'); app.edit('content','你好\n A😀');
  assert.equal(app.e.count.textContent,2); assert.equal(app.e.words.textContent,'4 字');
  const restored=boot(app.data()); assert.equal(restored.e.title.value,'我的笔记'); assert.equal(restored.e.content.value,'你好\n A😀');
});
test('切换笔记保留内容，搜索标题与正文',()=>{
  const app=boot(); app.e.create.onclick(); app.edit('title','测试标题'); app.edit('content','独特正文');
  app.e.list.children[1].onclick(); assert.equal(app.e.title.value,'把日子写成喜欢的样子');
  app.edit('search','独特正文'); assert.equal(app.e.list.children.length,1); app.e.list.children[0].onclick(); assert.equal(app.e.content.value,'独特正文');
  app.edit('search','测试标题'); assert.equal(app.e.list.children.length,1);
  app.edit('search','不存在'); assert.equal(app.e.list.children[0].textContent,'没有找到相关笔记');
});
test('取消删除、确认删除、删空后刷新与重新创建',()=>{
  const app=boot();app.e.delete.onclick();app.e.confirm.returnValue='cancel';app.e.confirm.fire('close');assert.equal(app.e.count.textContent,1);
  app.remove();assert.equal(app.e.count.textContent,0);assert.equal(app.e.editor.hidden,true);assert.equal(app.e.delete.disabled,true);
  const restored=boot(app.data());assert.equal(restored.e.count.textContent,0);assert.equal(restored.e.empty.hidden,false);
  restored.e.create.onclick();assert.equal(restored.e.count.textContent,1);assert.equal(restored.e.editor.hidden,false);
});
test('标签作为文本显示，空标题有默认名称',()=>{
  const app=boot();app.e.create.onclick();app.edit('content','<script>alert(1)</script>');
  assert.equal(app.e.list.children[0].children[0].textContent,'未命名笔记');assert.equal(app.e.list.children[0].children[1].textContent,'<script>alert(1)</script>');
});
test('存储损坏不覆盖原始数据；写入失败显示提示',()=>{
  const broken=boot('{broken');broken.e.create.onclick();assert.equal(broken.data(),'{broken');assert.match(broken.e.status.textContent,/保存失败/);
  const failed=boot(null,true);assert.match(failed.e.status.textContent,/保存失败/);failed.edit('content','仍可编辑');assert.equal(failed.e.content.value,'仍可编辑');
});
