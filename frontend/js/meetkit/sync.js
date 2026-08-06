;(function(){
  const storage = window.meetkitStorage
  const norm = (s)=> String(s||'').trim().toLowerCase()
  const USE_API = true // flip to true to use backend API

  // Offline storage shims
  function mergeBacklinks(existing, incoming){
    const out = Array.isArray(existing) ? existing.slice() : []
    const key = (x)=> `${x.dateISO}::${x.blockId}`
    const seen = new Set(out.map(key))
    for(const item of (incoming||[])){
      const k = key(item)
      if (!seen.has(k)) { out.push(item); seen.add(k) }
    }
    return out
  }

  const store = {
    loadDay: async (dateISO)=> storage.getState().notes[dateISO] || { blocks: [] },
    saveDay: async (dateISO, notes)=>{ const st=storage.getState(); st.notes[dateISO]={...(st.notes[dateISO]||{}),...notes}; storage.setState({ notes: st.notes }) },
    listPages: async ()=> storage.getState().pages,
    upsertPage: async (slug,title)=>{ const st=storage.getState(); st.pages[slug]={ title: title||slug, createdAt: st.pages[slug]?.createdAt||Date.now(), updatedAt: Date.now() }; storage.setState({ pages: st.pages }) },
    getBacklinks: async (slug)=> {
      const st = storage.getState(); const target = norm(slug)
      const acc = []
      for (const [k, arr] of Object.entries(st.backlinks || {})){
        if (norm(k) === target){ acc.push(...(Array.isArray(arr)?arr:[])) }
      }
      // dedupe by dateISO+blockId
      const seen = new Set(); const out=[]
      for (const it of acc){ const key=`${it.dateISO}::${it.blockId}`; if(!seen.has(key)){ seen.add(key); out.push(it) } }
      return out
    },
    setBacklinks: async (slug,list)=>{ const st=storage.getState(); const merged=mergeBacklinks(st.backlinks[slug]||[], Array.isArray(list)?list:[]); st.backlinks[slug]=merged; storage.setState({ backlinks: st.backlinks }) },
    getPins: async ()=> storage.getState().map?.pins || [],
    addPin: async (pin)=>{ const st=storage.getState(); const id = pin.id || Math.random().toString(36).slice(2,9); const pins=[...(st.map?.pins||[]), { ...pin, id }]; storage.setState({ map: { ...(st.map||{}), pins } }); return { id } },
    deletePin: async (id)=>{ const st=storage.getState(); const pins=(st.map?.pins||[]).filter(p=>p.id!==id); storage.setState({ map: { ...(st.map||{}), pins } }) },
    saveWhiteboard: async (data)=> storage.setState({ whiteboard: { ...data, updatedAt: Date.now() } })
  }

  // API impl
  async function load(dateISO){
    if (!USE_API) return store.loadDay(dateISO)
    try {
      const r = await fetch(`/api/meetkit/notes/${dateISO}`)
      if (!r.ok) throw new Error('load not ok')
      const data = await r.json()
      const local = await store.loadDay(dateISO)
      const dataBlocks = Array.isArray(data?.blocks) ? data.blocks : []
      const localBlocks = Array.isArray(local?.blocks) ? local.blocks : []
      // Prefer local content if API returns empty but local has content
      if (localBlocks.length && !dataBlocks.length) return { blocks: localBlocks }
      if (!data || typeof data !== 'object') return { blocks: localBlocks }
      return data
    } catch {
      return store.loadDay(dateISO)
    }
  }
  async function save(dateISO, notes){
    if (!USE_API) return store.saveDay(dateISO, notes)
    try {
      const r = await fetch(`/api/meetkit/notes/${dateISO}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(notes) })
      if (!r.ok) throw new Error('save not ok')
      // Also persist locally for resilience and immediate fallback
      try { await store.saveDay(dateISO, notes) } catch {}
    } catch {
      return store.saveDay(dateISO, notes)
    }
  }
  async function listPages(){
    if (!USE_API) return store.listPages()
    try {
      const r = await fetch(`/api/meetkit/pages`); if (!r.ok) throw 0; return await r.json()
    } catch { return store.listPages() }
  }
  async function listNotes(){
    const st = storage.getState()
    const localNotes = st.notes || {}
    if (!USE_API) return localNotes
    try {
      const r = await fetch('/api/meetkit/notes')
      if (!r.ok) throw 0
      const rows = await r.json()
      const mergedNotes = { ...localNotes }
      for (const row of (Array.isArray(rows) ? rows : [])){
        const dateISO = row?.dateISO || row?.date_iso
        if (!dateISO) continue
        const serverBlocks = Array.isArray(row?.blocks) ? row.blocks : []
        const localBlocks = Array.isArray(mergedNotes[dateISO]?.blocks) ? mergedNotes[dateISO].blocks : []
        mergedNotes[dateISO] = {
          ...(mergedNotes[dateISO] || {}),
          blocks: localBlocks.length ? localBlocks : serverBlocks,
          updatedAt: row?.updatedAt || row?.updated_at || mergedNotes[dateISO]?.updatedAt,
        }
      }
      try { storage.setState({ notes: mergedNotes }) } catch {}
      return mergedNotes
    } catch {
      return localNotes
    }
  }
  async function upsertPage(slug,title){
    if (!USE_API) return store.upsertPage(slug,title)
    try {
      const r = await fetch(`/api/meetkit/pages`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({slug,title}) })
      if (!r.ok) throw 0
      // Keep local cache in sync for immediate UI counts
      try { await store.upsertPage(slug, title) } catch {}
    } catch { return store.upsertPage(slug,title) }
  }
  async function getBacklinks(slug){
    if (!USE_API) return store.getBacklinks(slug)
    try {
      const r = await fetch(`/api/meetkit/pages/${encodeURIComponent(slug)}/backlinks`)
      if (!r.ok) throw 0
      const data = await r.json()
      // Merge with local in case of legacy casing
      const local = await store.getBacklinks(slug)
      return mergeBacklinks(data, local)
    } catch { return store.getBacklinks(slug) }
  }
  async function setBacklinks(slug,list){
    if (!USE_API) return store.setBacklinks(slug,list)
    try {
      // Merge with existing backlinks on the server to avoid wiping other dates
      const existingRes = await fetch(`/api/meetkit/pages/${encodeURIComponent(slug)}/backlinks`)
      const existing = existingRes.ok ? await existingRes.json() : []
      const incoming=Array.isArray(list)?list:[]; const dates=new Set(incoming.map(x=>x?.dateISO).filter(Boolean)); const pruned=existing.filter(x=>!dates.has(x?.dateISO)); const merged=mergeBacklinks(pruned, incoming)
      const r = await fetch(`/api/meetkit/pages/${encodeURIComponent(slug)}/backlinks`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(merged) })
      if (!r.ok) throw 0
      // Update local cache so counts and lists reflect new refs immediately
      try { await store.setBacklinks(slug, merged) } catch {}
    } catch { return store.setBacklinks(slug,list) }
  }
  async function saveWhiteboard(data){
    if (!USE_API) return store.saveWhiteboard(data)
    try {
      const r = await fetch(`/api/meetkit/whiteboard`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
      if (!r.ok) throw 0
    } catch { return store.saveWhiteboard(data) }
  }
  async function getPins(){
    if (!USE_API) return store.getPins()
    try { const r = await fetch(`/api/meetkit/map/pins`); if (!r.ok) throw 0; return await r.json() } catch { return store.getPins() }
  }
  async function addPin(pin){
    if (!USE_API) return store.addPin(pin)
    try { const r = await fetch(`/api/meetkit/map/pins`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(pin) }); if (!r.ok) throw 0; return await r.json() } catch { return store.addPin(pin) }
  }
  async function deletePin(id){
    if (!USE_API) return store.deletePin(id)
    try { const r = await fetch(`/api/meetkit/map/pins/${encodeURIComponent(id)}`, { method:'DELETE' }); if (!r.ok) throw 0 } catch { return store.deletePin(id) }
  }

  async function search(q){
    q = String(q||'').trim()
    if (!q) return []
    if (!USE_API) {
      const s = window.meetkit?.storage?.getState?.() || {}
      const dates = Object.keys(s.notes||{})
      const hits = []
      dates.forEach(d=>{
        const blocks = (s.notes[d]?.blocks)||[]
        const text = blocks.map(b=>b.text||'').join('\n')
        if (text.toLowerCase().includes(q.toLowerCase())) hits.push({ date_iso: d, snip: d })
      })
      Object.keys(s.pages||{}).forEach(slug=>{
        if (slug.toLowerCase().includes(q.toLowerCase())) hits.push({ date_iso: slug, snip: slug })
      })
      return hits.slice(0,20)
    }
    const r = await fetch(`/api/meetkit/search?q=${encodeURIComponent(q)}`)
    if (!r.ok) return []
    return await r.json()
  }

  window.meetkitSync = { load, save, listNotes, listPages, upsertPage, getBacklinks, setBacklinks, saveWhiteboard, getPins, addPin, deletePin, search }
})();


