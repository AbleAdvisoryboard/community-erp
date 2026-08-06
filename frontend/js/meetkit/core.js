;(function(){
  const storage = window.meetkitStorage
  const meetings = (window.meetkit && window.meetkit.meetings) || window.meetkitMeetings
  const whiteboard = window.meetkitWhiteboard
  const mapmod = window.meetkitMap
  const graphmod = window.meetkitGraph

  // Event bus
  const listeners = new Set()
  function onEvent(fn){ listeners.add(fn); return () => listeners.delete(fn) }
  document.addEventListener('meetkit:event', (e)=>{ for(const fn of listeners) try{ fn(e.detail) } catch(err){ console.error(err) } })

  let __dirty = false
  function mount(){
    const root = document.getElementById('meetkit-root')
    if (!root) return
    const view = document.getElementById('meetkit-view')
    const tabs = root.querySelectorAll('.meetkit-tabs [data-tab]')
    function activate(tab){
      tabs.forEach(b=>b.classList.toggle('active', b.getAttribute('data-tab')===tab))
      if (tab==='meetings') meetings.mount(view)
      if (tab==='whiteboard') whiteboard.mount(view)
      if (tab==='map') mapmod.mount(view)
      if (tab==='graph') graphmod.mount(view)
    }
    tabs.forEach(b=> b.addEventListener('click', ()=> activate(b.getAttribute('data-tab'))))
    const defaultTab = root.getAttribute('data-default-tab') || 'meetings'
    removeLegacyDemoContent()
    cleanupLegacyDemoContentFromServer().finally(() => activate(defaultTab))

    setupShortcuts(root)

    // Prevent accidental page-back on Backspace while editing
    window.addEventListener('keydown', (e) => {
      const a = document.activeElement
      const isEditable = a && (a.isContentEditable || ['INPUT','TEXTAREA'].includes(a.tagName))
      if (isEditable && e.key === 'Backspace') {
        e.stopPropagation()
      }
    })

    // Warn when closing with unsaved edits
    window.addEventListener('beforeunload', (e)=>{
      if (!__dirty) return
      e.preventDefault(); e.returnValue = ''
    })
  }

  function setupShortcuts(root){
    // Ctrl/Cmd+K quick switcher
    window.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){
        e.preventDefault(); openQuickSwitcher()
      }
    })
  }

  function openQuickSwitcher(){
    const overlay = document.createElement('div')
    Object.assign(overlay.style, { position:'fixed', inset:'0', background:'rgba(0,0,0,0.25)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'10vh', zIndex:1000 })
    const box = document.createElement('div')
    Object.assign(box.style, { width:'640px', background:'#fff', borderRadius:'8px', border:'1px solid #e1e4e8', boxShadow:'0 8px 24px rgba(0,0,0,0.15)' })
    const input = document.createElement('input')
    Object.assign(input.style, { width:'100%', padding:'10px 12px', border:'none', borderBottom:'1px solid #e1e4e8', fontSize:'16px' })
    input.placeholder = 'Search pages or YYYY-MM-DD'
    const list = document.createElement('div')
    Object.assign(list.style, { maxHeight:'50vh', overflow:'auto', padding:'6px' })
    box.append(input, list); overlay.appendChild(box); document.body.appendChild(overlay)

    let current = []
    async function doSearch(q){
      try { current = await (window.meetkitSync.search?.(q) || Promise.resolve([])) }
      catch { current = [] }
      render()
    }
    function render(){
      list.innerHTML=''
      for(const r of current){
        const row = document.createElement('div')
        Object.assign(row.style, { padding:'8px', borderRadius:'6px', cursor:'pointer' })
        row.innerHTML = `${/^\\d{4}-\\d{2}-\\d{2}$/.test(r.date_iso) ? "??" : "??"} <span>${r.snip || r.date_iso}</span>`
        row.addEventListener('click', ()=> choose(r))
        list.appendChild(row)
      }
    }
    function choose(item){
      const dateIso = item.date_iso
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)){
        document.querySelector('.meetkit-tabs [data-tab="meetings"]').click()
        setTimeout(()=>{
          const el = document.querySelector('#meetkit-root input[type="date"]')
          if (el){ el.value = dateIso; el.dispatchEvent(new Event('change')) }
        }, 0)
      } else {
        const evt = new CustomEvent('meetkit:event', { detail: { type:'openPage', slug: dateIso }})
        document.dispatchEvent(evt)
      }
      document.body.removeChild(overlay)
    }

    input.addEventListener('input', ()=> doSearch(input.value))
    input.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && current[0]) { e.preventDefault(); choose(current[0]) } })
    overlay.addEventListener('click', (e)=>{ if (e.target===overlay) document.body.removeChild(overlay) })
    doSearch(''); input.focus()
  }

  function seedDemoContentOnce(){
    removeLegacyDemoContent()
  }

  function removeLegacyDemoContent(){
    const st = storage.getState()
    if (!st) return

    let changed = false
    for (const [dateISO, note] of Object.entries(st.notes || {})){
      if (isLegacyDemoNote(note)){
        delete st.notes[dateISO]
        changed = true
      }
    }

    const ashleyPage = st.pages?.['clients/ashley']
    if (ashleyPage && String(ashleyPage.title || '').toLowerCase() === 'clients/ashley'){
      delete st.pages['clients/ashley']
      changed = true
    }
    for (const slug of ['clients', 'location']){
      if (st.pages?.[slug]){
        delete st.pages[slug]
        changed = true
      }
      if (st.backlinks?.[slug]){
        delete st.backlinks[slug]
        changed = true
      }
    }
    if (st.backlinks?.['clients/ashley']){
      delete st.backlinks['clients/ashley']
      changed = true
    }

    if (isLegacyDemoWhiteboard(st.whiteboard)){
      st.whiteboard = { strokes: [], updatedAt: 0 }
      changed = true
    }

    if (Array.isArray(st.map?.pins)){
      const pins = st.map.pins.filter(pin => !(pin?.title === 'Client NYC' && pin?.body === 'Kickoff next week'))
      if (pins.length !== st.map.pins.length){
        st.map = { ...st.map, pins }
        changed = true
      }
    }

    if (st.__seededMeetkit) {
      delete st.__seededMeetkit
      changed = true
    }
    if (changed) storage.save()
    cleanupLegacyDemoContentFromServer()
  }

  async function cleanupLegacyDemoContentFromServer(){
    try {
      await fetch('/api/meetkit/legacy-demo', { method: 'DELETE' })
    } catch {}
  }

  function isLegacyDemoNote(note){
    const text = flattenBlocks(note?.blocks || []).join('\n')
    return text.includes('Discuss onboarding plan #priority') && text.includes('Send proposal to [[Clients/Ashley]]')
  }

  function flattenBlocks(blocks){
    const out = []
    ;(function walk(list){
      for (const block of (list || [])){
        out.push(String(block?.text || ''))
        if (block?.children?.length) walk(block.children)
      }
    })(blocks)
    return out
  }

  function isLegacyDemoWhiteboard(board){
    const stroke = board?.strokes?.[0]
    return Array.isArray(board?.strokes)
      && board.strokes.length === 1
      && stroke?.tool === 'pen'
      && stroke?.w === 3
      && stroke?.color === '#111'
      && Array.isArray(stroke?.pts)
      && stroke.pts.length === 3
      && stroke.pts[0]?.x === 20
      && stroke.pts[0]?.y === 20
  }

  // Route openPage events to filter references panel
  onEvent((evt)=>{
    if (evt.type==='openPage'){
      // Open Meetings and focus references panel with filter selection
      const btn = document.querySelector('.meetkit-tabs [data-tab="meetings"]')
      btn?.click()
      setTimeout(()=>{
        const refs = document.querySelector('#meetkit-refs')
        if (refs){
          refs.scrollIntoView({ behavior:'smooth', block:'nearest' })
        }
      }, 0)
    }
  })

  document.addEventListener('DOMContentLoaded', mount)

  // Expose a global namespace for diagnostics
  window.meetkit = {
    storage: window.meetkitStorage,
    parser: window.meetkitParser,
    sync: window.meetkitSync,
    meetings: window.meetkitMeetings,
    whiteboard: window.meetkitWhiteboard,
    map: window.meetkitMap,
    core: { openQuickSwitcher, seedDemoContentOnce, removeLegacyDemoContent, cleanupLegacyDemoContentFromServer, setDirty: (v)=>{ __dirty = !!v } }
  }
})();

