;(function(){
  const { getState } = window.meetkitStorage
  const sync = window.meetkitSync

  async function ensureLeaflet(){
    function isReady(){ return typeof window.L !== 'undefined' }
    if (isReady()) return true
    await new Promise((res)=>{
      // Prefer local, fall back to CDN
      const cssLocal = '/vendor/leaflet/leaflet.css'
      const jsLocal  = '/vendor/leaflet/leaflet.js'
      const cssCdn   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      const jsCdn    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      const head = document.head
      function addCSS(href, onerr){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; l.onerror=onerr; head.appendChild(l) }
      function addJS(src, onload, onerr){ const s=document.createElement('script'); s.src=src; s.defer=true; s.onload=onload; s.onerror=onerr; head.appendChild(s) }
      function ready(){ if (window.L) res() }
      function failed(){ console.warn('Meetkit Map: Leaflet failed to load (local+cdn).'); res() }
      addCSS(cssLocal, ()=> addCSS(cssCdn, ()=>{}))
      addJS(jsLocal, ready, ()=> addJS(jsCdn, ready, failed))
    })
    return isReady()
  }

  function promptPin(){
    const title = window.prompt('Pin title?')
    if (title==null) return null
    const body = window.prompt('Pin body?') || ''
    return { title, body }
  }

  async function mount(container){
    container.innerHTML = ''
    const wrap = document.createElement('div'); wrap.className='meetkit-map-wrap'
    const mapDiv = document.createElement('div'); mapDiv.className='meetkit-map'
    const sidebar = document.createElement('aside'); sidebar.className='meetkit-map-sidebar'
    sidebar.innerHTML = '<h3>Pins (Locations)</h3><div style="font-size:12px;color:var(--color-muted,#666);margin-bottom:6px">This tab shows map locations. For page/tag connections, open the <strong>Connections</strong> tab.</div>'
    wrap.append(mapDiv, sidebar)
    container.appendChild(wrap)

    const ok = await ensureLeaflet()
    if (!ok){ sidebar.innerHTML += '<div>Leaflet failed to load. Check CSP or add local vendor.</div>'; return }

    const L = window.L
    const map = L.map(mapDiv).setView([40.7128, -74.0060], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(map)

    let pins = await (window.meetkitSync.getPins?.() || Promise.resolve(getState().map?.pins||[]))
    const markers = new Map()

    function refreshList(){
      sidebar.querySelectorAll('.meetkit-pin').forEach(x=>x.remove())
      for(const p of pins){
        const row = document.createElement('div'); row.className='meetkit-pin'
        const left = document.createElement('div'); left.innerHTML = `<strong>${p.title}</strong><div style="font-size:12px;color:var(--color-muted,#666)">${p.body}</div>`
        const right = document.createElement('div')
        const del = document.createElement('button'); del.textContent='Delete'; del.setAttribute('aria-label','Delete pin')
        row.append(left, right); right.append(del)
        sidebar.appendChild(row)
        row.addEventListener('click', ()=>{ map.setView([p.lat, p.lng], 10); markers.get(p.id)?.openPopup() })
        del.addEventListener('click', (e)=>{ e.stopPropagation(); removePin(p.id) })
      }
    }

    async function addPin(lat, lng, title, body){
      const base = { lat, lng, title, body }
      const result = await (window.meetkitSync.addPin?.(base) || { id: Math.random().toString(36).slice(2,9) })
      const pin = { id: result.id, ...base, createdAt: Date.now() }
      pins.push(pin)
      drawPin(pin); refreshList();
    }

    async function removePin(id){
      pins = pins.filter(p=>p.id!==id)
      markers.get(id)?.remove(); markers.delete(id)
      refreshList();
      try { await window.meetkitSync.deletePin?.(id) } catch {}
    }

    function drawPin(p){
      const m = L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<strong>${p.title}</strong><div>${p.body}</div>`)
      markers.set(p.id, m)
    }

    // initial
    for(const p of pins) drawPin(p)
    refreshList()

    map.on('click', (e)=>{
      const data = promptPin(); if (!data) return
      addPin(e.latlng.lat, e.latlng.lng, data.title, data.body)
    })
  }

  window.meetkitMap = { mount }
})();
