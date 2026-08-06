;(function(){
  const sync = window.meetkitSync
  const { renderInline, toggleCheckbox } = window.meetkitParser
  const NS = 'meetkit-meetings'
  const backlinksCache = new Map()

  let dateISO = todayISO()
  let doc = { blocks: [] }
  let leftPane, mainPane, rightPane, dateLabel, prevBtn, nextBtn, todayBtn, calendarInput

  function todayISO(){ return new Date().toISOString().slice(0,10) }
  function uid(){ return 'b_' + Math.random().toString(36).slice(2,9) }
  function el(tag, cls, html){ const n=document.createElement(tag); if(cls) n.className=cls; if(html!=null) n.innerHTML=html; return n }
  function normSlug(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase() }

  function layout(){
    const root = document.getElementById('meetkit-view')
    if (!root) return
    root.innerHTML = ''
    const shell = el('div', `${NS} grid`)
    const header = el('div', `${NS}__header`)
    prevBtn = el('button', `${NS}__nav`, '‹')
    nextBtn = el('button', `${NS}__nav`, '›')
    todayBtn = el('button', `${NS}__today`, 'Today')
    dateLabel = el('div', `${NS}__date`)
    calendarInput = el('input', `${NS}__calendar`); calendarInput.type='date'; calendarInput.value = dateISO
    // Wrap the date input (indicator removed per request)
    const dateWrap = el('div', `${NS}__date-wrap`)
    dateWrap.append(calendarInput)
    const headerSpacer = el('div', `${NS}__header-spacer`)
    const helpHeaderBtn = el('button', `${NS}__btn`, 'How to use')
    header.append(prevBtn, dateLabel, nextBtn, todayBtn, dateWrap, headerSpacer, helpHeaderBtn)

    const panes = el('div', `${NS}__panes`)
    // Left sidebar removed per request (bigger editor canvas)
    // leftPane = el('aside', `${NS}__left`)
    mainPane = el('main', `${NS}__main`)
    rightPane = el('aside', `${NS}__right`)
    // No left sidebar rendering

    const tools = el('div', `${NS}__tools`)
    const tplBtn = el('button', `${NS}__btn`, 'Insert template')
    const pageBtn = el('button', `${NS}__btn`, '[[PageName]]')
    const tagBtn = el('button', `${NS}__btn`, '#Tag')
    const spacer = el('div', `${NS}__spacer`)
    const saveBtn = el('button', `${NS}__btn`, 'Save')
    tools.append(tplBtn, pageBtn, tagBtn, spacer, saveBtn)
    const outliner = el('div', `${NS}__outliner`); outliner.setAttribute('role','tree')
    mainPane.append(tools, outliner)

    const refsHdr = el('div', `${NS}__refs-hdr`, 'References')
    const refsList = el('div', `${NS}__refs-list`)
    rightPane.append(refsHdr, refsList)

    panes.append(mainPane, rightPane)
    shell.append(header, panes)
    root.append(shell)

    prevBtn.addEventListener('click', ()=> setDate(shiftDate(-1)))
    nextBtn.addEventListener('click', ()=> setDate(shiftDate(+1)))
    todayBtn.addEventListener('click', ()=> setDate(todayISO()))
    calendarInput.addEventListener('change', ()=> setDate(calendarInput.value || todayISO()))
    tplBtn.addEventListener('click', insertTemplate)
    pageBtn.addEventListener('click', ()=> wrapSelectionWithPages())
    tagBtn.addEventListener('click', ()=> prefixSelectionWithHash())
    helpHeaderBtn.addEventListener('click', openHelp)
    saveBtn.addEventListener('click', save)
    window.addEventListener('keydown', (e)=>{ if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); save() } })

    render()
  }

  function renderLeftSidebar(){
    const wrap = el('div', `${NS}__left-wrap`)
    const journ = el('div', `${NS}__section`); journ.innerHTML = `<div class="${NS}__section-title">Journal</div>`
    const ul = el('ul', `${NS}__list`)
    for(let i=13;i>=0;i--){ const d=shiftDate(-i); const li=el('li', `${NS}__list-item${d===dateISO?' active':''}`); li.innerHTML=`<button>${d}</button>`; li.querySelector('button').addEventListener('click',()=> setDate(d)); ul.append(li) }
    journ.append(ul)

    const pages = el('div', `${NS}__section`); pages.innerHTML = `<div class="${NS}__section-title">Pages</div>`
    const pls = el('ul', `${NS}__list`); pages.append(pls)
    ;(sync.listPages?.() || Promise.resolve([])).then(rows=>{ pls.innerHTML=''; (rows||[]).forEach(p=>{ const li=el('li',`${NS}__list-item`); li.innerHTML=`<button>${p.title||p.slug}</button>`; li.querySelector('button').addEventListener('click',()=> openPage(p.slug)); pls.append(li) }) })

    wrap.append(journ, pages); return wrap
  }

  function shiftDate(delta){ const d=new Date(dateISO); d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10) }

  function render(){
    dateLabel.textContent = new Date(dateISO+'T00:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    calendarInput.value = dateISO
    const outliner = mainPane.querySelector(`.${NS}__outliner`)
    outliner.innerHTML = ''
    if (!doc.blocks || !doc.blocks.length) doc.blocks = [{ id: uid(), text:'', children:[] }]
    doc.blocks.forEach(b=> outliner.append(renderBlock(b,0)))
    renderRefs()
    const first = outliner.querySelector('[contenteditable]'); if (first) placeCaretEnd(first)
  }


  function renderBlock(block, depth){
    const row = el('div', `${NS}__row`); row.dataset.id = block.id
    const gutter = el('div', `${NS}__gutter`); gutter.innerHTML = `<span class="${NS}__bullet"></span>`
    const body = el('div', `${NS}__body`)
    const line = el('div', `${NS}__line`); line.contentEditable='true'; line.dataset.depth=depth
    line.innerHTML = renderInline(block.text||'')
    line.addEventListener('input', ()=>{ block.text = line.textContent||''; markDirty() })
    line.addEventListener('keydown', (e)=> onKeyDown(e, block, line))
    body.append(line)
    const kids = el('div', `${NS}__children`)
    ;(block.children||[]).forEach(k=> kids.append(renderBlock(k, depth+1)))
    row.append(gutter, body, kids)
    return row
  }

  function onKeyDown(e, block, line){
    // Backspace at line start: prefer moving focus to the line above
    if (e.key==='Backspace' && !(e.metaKey||e.ctrlKey)){
      const sel = document.getSelection()
      if (sel && sel.anchorNode && sel.isCollapsed){
        // Determine caret at start of this line
        const range = sel.getRangeAt(0)
        const atStart = range.startOffset === 0 && line.contains(range.startContainer)
        if (atStart){
          e.preventDefault()
          const p = findPath(doc.blocks, block.id)
          const depth = parseInt(line.dataset.depth||'0',10) || 0
          const isEmpty = (line.textContent||'').trim()===''
          if (p){
            const last = p[p.length-1]
            const L = last.list
            const i = last.index
            if (isEmpty){
              // If empty, jump to the line above: previous sibling if exists, else parent
              if (i>0){
                const prev = L[i-1]
                L.splice(i,1)
                markDirty(); render(); focusBlock(prev.id); return
              } else if (p.length>1){
                const parent = p[p.length-2].node
                L.splice(i,1)
                markDirty(); render(); focusBlock(parent.id); return
              }
            } else if (depth>0){
              // Non-empty nested line: outdent one level
              outdent(block.id); render(); focusBlock(block.id); return
            } else if (i>0){
              // Top-level: merge into previous sibling
              const prev = L[i-1]
              prev.children = (prev.children||[]).concat(block.children||[])
              prev.text = (prev.text||'') + (block.text||'')
              L.splice(i,1)
              markDirty(); render(); focusBlock(prev.id); return
            }
          }
        }
      }
    }
    if (e.key==='Enter'){ e.preventDefault(); const nb={id:uid(),text:'',children:[]}; insertAfter(doc.blocks, block.id, nb); render(); focusBlock(nb.id); return }
    if (e.key==='Tab'){ e.preventDefault(); if (e.shiftKey) outdent(block.id); else indent(block.id); render(); focusBlock(block.id); return }
    if ((e.metaKey||e.ctrlKey) && e.key==='Backspace'){ e.preventDefault(); removeBlock(block.id); render(); return }
    if ((e.metaKey||e.ctrlKey) && (e.key==='ArrowUp'||e.key==='ArrowDown')){ e.preventDefault(); moveBlock(block.id, e.key==='ArrowUp'?-1:1); render(); focusBlock(block.id); return }
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='x'){ e.preventDefault(); block.text=toggleCheckbox(block.text); line.innerHTML=renderInline(block.text); markDirty(); return }
  }

  function walk(list, fn){ list.forEach((b,i)=>{ fn(list,b,i); if (b.children?.length) walk(b.children, fn) }) }
  function findPath(list, id, path=[]){ for(let i=0;i<list.length;i++){ const b=list[i]; if(b.id===id) return [...path,{list,index:i,node:b}]; const sub=findPath(b.children||[], id, [...path,{list,index:i,node:b}]); if(sub) return sub } return null }
  function insertAfter(_list,id,newB){ const p=findPath(doc.blocks,id); if(!p) return; const last=p[p.length-1]; last.list.splice(last.index+1,0,newB); markDirty() }
  function removeBlock(id){ const p=findPath(doc.blocks,id); if(!p) return; const last=p[p.length-1]; last.list.splice(last.index,1); markDirty() }
  function indent(id){ const p=findPath(doc.blocks,id); if(!p) return; const last=p[p.length-1]; if(last.index===0) return; const prev=last.list[last.index-1]; prev.children=prev.children||[]; const [b]=last.list.splice(last.index,1); prev.children.push(b); markDirty() }
  function outdent(id){ const p=findPath(doc.blocks,id); if(!p) return; if(p.length<2) return; const last=p[p.length-1]; const parent=p[p.length-2]; const [b]=last.list.splice(last.index,1); const up=p[p.length-3]; const L=up? up.node.children : doc.blocks; const pos=(up? parent.index : (L.indexOf(parent.node)))+1; L.splice(pos,0,b); markDirty() }
  function moveBlock(id,dir){ const p=findPath(doc.blocks,id); if(!p) return; const last=p[p.length-1]; const L=last.list; const i=last.index; const j=i+dir; if(j<0||j>=L.length) return; [L[i],L[j]]=[L[j],L[i]]; markDirty() }

  async function renderRefs(){
    const refsList = rightPane.querySelector(`.${NS}__refs-list`); if (!refsList) return; refsList.innerHTML=''
    const hdr = el('div', `${NS}__refs-hdr`, 'Global References')
    const filter = el('input', null)
    filter.type = 'search'; filter.placeholder = 'Filter pages/tags…'; filter.style.cssText = 'width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:6px;margin-bottom:8px;'
    const groups = el('div')
    refsList.append(hdr, filter, groups)

    // Collect pages globally from API/storage/backlinks/notes
    let allPagesRaw = []
    try { allPagesRaw = await (sync.listPages?.() || []) } catch { allPagesRaw = [] }
    let entries = []
    if (Array.isArray(allPagesRaw)) entries = allPagesRaw.map(p => ({ slug: normSlug(p.slug || p), title: p.title || p.slug || String(p) }))
    else if (allPagesRaw && typeof allPagesRaw === 'object') entries = Object.entries(allPagesRaw).map(([slug, p]) => ({ slug: normSlug(slug), title: (p && p.title) || slug }))

    try { await (sync.listNotes?.() || Promise.resolve({})) } catch {}
    const st = (window.meetkitStorage && window.meetkitStorage.getState && window.meetkitStorage.getState()) || { pages:{}, notes:{}, backlinks:{} }
    const fromBacklinks = Object.keys(st.backlinks || {}).map(normSlug)
    const fromNotesSet = new Set()
    const fromTagsSet = new Set()
    try {
      const notes = st.notes || {}
      const re = /\[\[([^\]]+)\]\]/g
      for (const d of Object.keys(notes)){
        const blocks = notes[d]?.blocks || []
        ;(function walk(arr){ for(const b of (arr||[])){ const s=String(b.text||''); let m; while((m=re.exec(s))){ fromNotesSet.add(normSlug(m[1])) } if (b.children?.length) walk(b.children) } })(blocks)
      }
    } catch {}
    // Also gather tag slugs across notes for top-level entries
    try {
      const notes = st.notes || {}
      const tagRe = /(^|[\s(])#([A-Za-z][\w\/-]*)/g
      for (const d of Object.keys(notes)){
        const blocks = notes[d]?.blocks || []
        ;(function walk(arr){ for(const b of (arr||[])){ const s=String(b.text||''); let m; while((m=tagRe.exec(s))){ fromTagsSet.add(normSlug(m[2])) } if (b.children?.length) walk(b.children) } })(blocks)
      }
    } catch {}
    const set = new Set(entries.map(e=>e.slug))
    for (const s of fromBacklinks) if (!set.has(s)){ entries.push({ slug: s, title: s }); set.add(s) }
    for (const s of fromNotesSet) if (!set.has(s)){ entries.push({ slug: s, title: s }); set.add(s) }
    for (const s of fromTagsSet) if (!set.has(s)){ entries.push({ slug: s, title: s }); set.add(s) }

    // Build local counts from storage backlinks if available
    const countMap = {}
    for (const [slug, arr] of Object.entries(st.backlinks||{})) countMap[normSlug(slug)] = Array.isArray(arr) ? arr.length : 0

    function renderGroups(){
      const q = (filter.value||'').toLowerCase()
      groups.innerHTML = ''
      // Deduplicate by slug and pick a nicer display title
      const bySlug = new Map()
      for (const e of entries){
        if (!e || !e.slug) continue
        const prev = bySlug.get(e.slug)
        if (!prev) bySlug.set(e.slug, e.title || e.slug)
        else {
          const hasCaps = /[A-Z]/.test(e.title||'')
          const prevCaps = /[A-Z]/.test(prev||'')
          if (hasCaps && !prevCaps) bySlug.set(e.slug, e.title)
          else if ((e.title||'').length > (prev||'').length) bySlug.set(e.slug, e.title)
        }
      }
      const pages = Array.from(bySlug, ([slug,title]) => ({ slug, title }))
        .filter(p => !q || (p.slug||'').includes(q) || (p.title||'').toLowerCase().includes(q))
      pages.slice(0,200).forEach(p => appendRefGroup(groups, p.slug, true, countMap[p.slug]))
    }
    filter.addEventListener('input', renderGroups)
    renderGroups()
  }

  function collectTagBacklinks(tagSlug){
    const st = (window.meetkitStorage && window.meetkitStorage.getState && window.meetkitStorage.getState()) || { notes:{} }
    const out = []
    const re = /(^|[\s(])#([A-Za-z][\w\/-]*)/g
    for (const [d, note] of Object.entries(st.notes||{})){
      const blocks = Array.isArray(note?.blocks) ? note.blocks : []
      ;(function walk(arr){
        for(const b of (arr||[])){
          const s = String(b.text||''); let m
          while ((m = re.exec(s))){ const t = normSlug(m[2]); if (t===tagSlug){ out.push({ dateISO: d, blockId: b.id, excerpt: s.replace(/[#\[\]]/g,'').slice(0,120) }) } }
          if (b.children?.length) walk(b.children)
        }
      })(blocks)
    }
    // Dedupe and sort
    const seen = new Set(); const dedup=[]
    for(const it of out){ const k = `${it.dateISO}::${it.blockId}`; if(!seen.has(k)){ seen.add(k); dedup.push(it) } }
    dedup.sort((a,b)=> String(b.dateISO).localeCompare(String(a.dateISO)))
    return dedup
  }

  async function appendRefGroup(container, slug, lazy, initialCount, displayTitle){
    const group = el('div', 'meetkit-refgroup')
    const toggle = el('button', 'meetkit-refgroup-toggle')
    toggle.setAttribute('aria-expanded','false')
    const label = displayTitle || slug
    toggle.innerHTML = `<span class=\"caret\">&#9654;</span> <span>${label}</span> <span class="meetkit-refgroup-count"></span>`
    const inner = el('div', 'meetkit-refgroup-list')
    inner.hidden = true
    group.append(toggle, inner)
    container.append(group)

    // No top-level counts until expanded
    const countEl = toggle.querySelector('.meetkit-refgroup-count')
    countEl.textContent = ""

    // Build sub-groups: Page [[slug]] and Tag #slug
    function makeSub(kind, prefetched){
      const sub = el('div', 'meetkit-refgroup meetkit-refgroup-sub')
      const subToggle = el('button', 'meetkit-refgroup-toggle')
      subToggle.setAttribute('aria-expanded','false')
      const pretty = kind==='page' ? `[[${slug}]]` : `#${slug}`
      subToggle.innerHTML = `<span class=\"caret\">&#9654;</span> <span>${pretty}</span> <span class="meetkit-refgroup-count"></span>`
      const listWrap = el('div', 'meetkit-refgroup-list'); listWrap.hidden = true
      sub.append(subToggle, listWrap)
      let all = prefetched || null; let shown = 0; const PAGE=50
      const subCountEl = subToggle.querySelector('.meetkit-refgroup-count'); subCountEl.textContent = ''
      function renderMore(){
        if (!all) return
        const slice = all.slice(shown, shown+PAGE)
        slice.forEach(r=>{
          const it = el('div', `${NS}__refitem`)
          it.innerHTML = `<button data-date="${r.dateISO}">${r.dateISO}</button> - <span>${r.excerpt||''}</span>`
          it.querySelector('button').addEventListener('click', ()=> setDate(r.dateISO))
          listWrap.append(it)
        })
        shown += slice.length
        moreBtn.style.display = shown < all.length ? 'block' : 'none'
      }
      const moreBtn = el('button', 'meetkit-refgroup-more', 'Load more')
      moreBtn.addEventListener('click', renderMore)
      listWrap.append(moreBtn)
      subToggle.addEventListener('click', ()=>{
        const expanded = subToggle.getAttribute('aria-expanded')==='true'
        subToggle.setAttribute('aria-expanded', expanded ? 'false':'true')
        listWrap.hidden = expanded
        if (!expanded && shown===0){
          (async()=>{
            try{
              if (!all) all = kind==='page' ? await (sync.getBacklinks?.(slug)||[]) : collectTagBacklinks(slug)
            } catch { all = [] }
            // sanitize
            const seen = new Set()
            all = (Array.isArray(all) ? all : [])
              .filter(x => x && x.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(String(x.dateISO)))
              .filter(x => { const k = `${x.dateISO}::${x.blockId||x.dateISO}`; if (seen.has(k)) return false; seen.add(k); return true })
              .sort((a,b)=> String(b.dateISO).localeCompare(String(a.dateISO)))
            subCountEl.textContent = all.length>0 ? `(${all.length})` : ''
            renderMore()
          })()
        }
      })
      return sub
    }

    toggle.addEventListener('click', ()=>{
      const expanded = toggle.getAttribute('aria-expanded') === 'true'
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true')
      inner.hidden = expanded
      if (!expanded && inner.childElementCount===0){
        (async ()=>{
          try {
            let pageData = []
            try { pageData = await (sync.getBacklinks?.(slug) || []) } catch { pageData = [] }
            if (Array.isArray(pageData) && pageData.length){
              inner.append(makeSub('page', pageData))
            }
          } catch {}
          try {
            const tagData = collectTagBacklinks(slug)
            if (Array.isArray(tagData) && tagData.length){
              inner.append(makeSub('tag', tagData))
            }
          } catch {}
        })()
      }
    })
  }

  function openHelp(){
    const overlay = el('div', 'meetkit-modal-overlay')
    const modal = el('div', 'meetkit-modal')
    const header = el('header', null)
    const h2 = el('h2', null, 'Journal Help')
    const close = el('button', 'close', 'Close')
    const body = el('div', 'meetkit-modal-body')
    body.innerHTML = `
      <p>Outliner basics:</p>
      <ul>
        <li><strong>Enter</strong>: new block � <strong>Tab/Shift+Tab</strong>: indent / outdent</li>
        <li><strong>Ctrl/Cmd+?/?</strong>: move block � <strong>Ctrl/Cmd+Backspace</strong>: delete block</li>
        <li><strong>Ctrl/Cmd+X</strong> on a line starting with <code>- [ ]</code>: toggles checkbox</li>
      </ul>
      <p>Inline syntax:</p>
      <ul>
        <li><code>[[Page Name]]</code> ? creates/links a page and shows backlinks</li>
        <li><code>#tag</code> ? renders as a tag pill</li>
        <li><code>- [ ] Task</code> / <code>- [x] Done</code> ? tasks with checkbox</li>
        <li><code>## Heading</code> ? simple section headers</li>
      </ul>
      <p><strong>Tip:</strong> Highlight the word(s) first, then click <strong>[[PageName]]</strong> or <strong>#Tag</strong> to wrap/prefix the selection. If nothing is selected, a placeholder is inserted at the cursor.</p>
      <p>Toolbar shortcuts:</p>
      <ul>
        <li><strong>[[PageName]]</strong>: wraps selection in <code>[[...]]</code>, or inserts <code>[[PageName]]</code> at the cursor</li>
        <li><strong>#Tag</strong>: prefixes selection with <code>#</code> (e.g. Ashley ? #Ashley) or inserts <code>#tag </code> at the cursor</li>
      </ul>
      <p>Shortcuts:</p>
      <ul>
        <li><strong>Ctrl/Cmd+S</strong>: Save � <strong>Ctrl/Cmd+K</strong>: Quick switcher</li>
      </ul>
    `
    header.append(h2, close)
    modal.append(header, body)
    overlay.append(modal)
    document.body.appendChild(overlay)
    close.addEventListener('click', ()=> document.body.removeChild(overlay))
    overlay.addEventListener('click', (e)=>{ if (e.target===overlay) document.body.removeChild(overlay) })
  }

  function insertTemplate(){ const tpl=[{id:uid(),text:'## Agenda',children:[]},{id:uid(),text:'## Decisions',children:[]},{id:uid(),text:'## Action Items',children:[{id:uid(),text:'- [ ] Owner: [[Person/Team]] — Task',children:[]}]}]; doc.blocks.push(...tpl); markDirty(); render() }

  async function save(){
    await sync.save(dateISO, doc)
    const map = new Map()
    walk(doc.blocks, (_l,b)=>{
      const pages=(b.text.match(/\[\[([^\]]+)\]\]/g)||[]).map(m=>m.slice(2,-2))
      const excerpt=(b.text||'').replace(/[\#\[\]]/g,'').slice(0,120)
      pages.forEach(p=>{
        const key = normSlug(p)
        if (!map.has(key)) map.set(key, { title: p, items: [] })
        map.get(key).items.push({ dateISO, blockId:b.id, excerpt })
      })
    })
    for(const [slug,entry] of map.entries()){
      try{ await sync.upsertPage(slug, entry.title) }catch{}
      try{ await sync.setBacklinks(slug, entry.items) }catch{}
    }
    // Refresh references pane so new/updated page names appear immediately
    try { await renderRefs() } catch {}
    toast('Saved'); window.meetkit?.core?.setDirty(false)
  }

  async function reindexBacklinks(silent){
    try {
      let notes = {}
      try {
        notes = await (sync.listNotes?.() || {})
      } catch {
        const st = (window.meetkitStorage && window.meetkitStorage.getState && window.meetkitStorage.getState()) || { notes:{} }
        notes = st.notes || {}
      }
      const bySlug = new Map()
      const add = (slug, title, dateISO, blockId, excerpt)=>{
        const key = normSlug(slug)
        if (!bySlug.has(key)) bySlug.set(key, { title: title || slug, items: [] })
        bySlug.get(key).items.push({ dateISO, blockId, excerpt })
      }
      for (const [d, note] of Object.entries(notes || {})){
        const blocks = Array.isArray(note?.blocks) ? note.blocks : []
        ;(function walk(arr){
          for (const b of (arr||[])){
            const pages=(String(b.text||'').match(/\[\[([^\]]+)\]\]/g)||[]).map(m=>m.slice(2,-2))
            const excerpt=(String(b.text||'').replace(/[\#\[\]]/g,'').slice(0,120))
            pages.forEach(p=> add(p, p, d, b.id, excerpt))
            if (b.children?.length) walk(b.children)
          }
        })(blocks)
      }
      for (const [slug, entry] of bySlug.entries()){
        try { await sync.upsertPage(slug, entry.title) } catch {}
        try { await sync.setBacklinks(slug, entry.items) } catch {}
      }
      try { await renderRefs() } catch {}
      if (!silent) toast('Reindexed')
    } catch (e) {
      console.error(e)
      if (!silent) toast('Reindex failed')
    }
  }

  // Run a one-time background reindex shortly after mount to reconcile counts
  let __didBgReindex = false

  function markDirty(){ try{ window.meetkit?.core?.setDirty(true) } catch{} }
  function placeCaretEnd(el){ el.focus(); const s=document.getSelection(); if(!s) return; s.selectAllChildren(el); s.collapseToEnd() }
  function focusBlock(id){ const node=document.querySelector(`.${NS}__row[data-id="${id}"] .${NS}__line`); if(node) placeCaretEnd(node) }
  function toast(msg){ let t=document.querySelector('.meetkit-toast'); if(!t){ t=document.createElement('div'); t.className='meetkit-toast'; document.body.appendChild(t) } t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1100) }
  function insertAtCaret(text){
    try {
      const sel = document.getSelection()
      if (!sel || sel.rangeCount===0){
        const first = document.querySelector(`.${NS}__line`)
        if (first){ first.focus(); document.execCommand('insertText', false, text); markDirty() }
        return
      }
      document.execCommand('insertText', false, text)
      markDirty()
    } catch {}
  }
  function selectionInLine(){
    const sel = document.getSelection(); if (!sel || sel.rangeCount===0) return false
    let node = sel.anchorNode; if (!node) return false
    if (node.nodeType === 3) node = node.parentNode
    return !!(node && node.closest && node.closest(`.${NS}__line`))
  }
  function wrapSelectionWithPages(){
    try {
      const sel = document.getSelection();
      if (selectionInLine() && sel && !sel.isCollapsed){
        const txt = sel.toString();
        document.execCommand('insertText', false, `[[${txt}]]`)
        markDirty();
      } else {
        insertAtCaret('[[PageName]]')
      }
    } catch { insertAtCaret('[[PageName]]') }
  }
  function prefixSelectionWithHash(){
    try {
      const sel = document.getSelection();
      if (selectionInLine() && sel && !sel.isCollapsed){
        const raw = sel.toString();
        const txt = raw.trimStart();
        const prefixed = txt.startsWith('#') ? txt : `#${txt}`
        document.execCommand('insertText', false, prefixed + ' ')
        markDirty();
      } else {
        insertAtCaret('#tag ')
      }
    } catch { insertAtCaret('#tag ') }
  }
  async function openPage(slug){ slug = normSlug(slug); let list=[]; try{ list= await (sync.getBacklinks?.(slug)||[]) }catch{}; const rp=rightPane.querySelector(`.${NS}__refs-list`); if(!rp) return; rp.innerHTML = `<div class="${NS}__refbox-title">References to [[${slug}]]</div>` + list.map(r=>`<div class="${NS}__refitem"><button data-date="${r.dateISO}">${r.dateISO}</button> — ${r.excerpt||''}</div>`).join(''); rp.querySelectorAll(`.${NS}__refitem button`).forEach(b=> b.addEventListener('click',()=> setDate(b.dataset.date))) }

  async function setDate(iso){ dateISO = iso || todayISO(); try{ doc = await sync.load(dateISO) || {blocks:[]} } catch { doc = { blocks: [] } } layout() }
  function mount(){
    const qp=new URLSearchParams(location.search).get('date')
    dateISO=(/^\d{4}-\d{2}-\d{2}$/.test(qp||''))? qp : todayISO()
    setDate(dateISO)
    // Background reconcile of backlinks once per load
    setTimeout(()=>{ if (!__didBgReindex){ __didBgReindex=true; try{ reindexBacklinks(true) } catch{} } }, 1200)
  }

  window.meetkit = window.meetkit || {}
  window.meetkit.meetings = { mount, setDate }
})();
















