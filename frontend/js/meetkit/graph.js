;(function(){
  const NS = 'meetkit-graph'

  function normSlug(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase() }

  async function buildGraphFromNotes(){
    let notes = {}
    try {
      notes = await (window.meetkitSync?.listNotes?.() || {})
    } catch {
      const st = (window.meetkitStorage && window.meetkitStorage.getState && window.meetkitStorage.getState()) || { notes:{} }
      notes = st.notes || {}
    }
    const pageRe = /\[\[([^\]]+)\]\]/g
    const tagRe = /(^|[\s(])#([A-Za-z][\w\/-]*)/g
    const nodeMap = new Map() // slug -> {id, slug, label, kind}
    const edgeSet = new Set() // key a||b (sorted)

    function addNode(slug, kind){
      const key = normSlug(slug)
      if (!nodeMap.has(key)) nodeMap.set(key, { id: key, slug: key, label: slug, kind })
      else {
        // Upgrade kind to 'page' if either appears as page
        if (kind==='page') nodeMap.get(key).kind = 'page'
      }
    }
    function addEdge(a,b){
      const x = normSlug(a), y = normSlug(b)
      if (!x || !y || x===y) return
      const k = x < y ? `${x}||${y}` : `${y}||${x}`
      edgeSet.add(k)
    }

    for (const [_d, note] of Object.entries(notes||{})){
      const blocks = Array.isArray(note?.blocks) ? note.blocks : []
      ;(function walk(arr){
        for(const b of (arr||[])){
          const s = String(b.text||'')
          // collect in this block
          const pages=[]; let m
          while((m=pageRe.exec(s))) { const slug=m[1]; pages.push(slug); addNode(slug,'page') }
          const tags=[]; tagRe.lastIndex=0
          while((m=tagRe.exec(s))) { const slug=m[2]; tags.push(slug); addNode(slug,'tag') }
          const items = [...pages, ...tags]
          for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) addEdge(items[i], items[j])
          if (b.children?.length) walk(b.children)
        }
      })(blocks)
    }

    const nodes = Array.from(nodeMap.values())
    const edges = Array.from(edgeSet).map(k=>{ const [a,b]=k.split('||'); return { a, b } })
    return { nodes, edges }
  }

  function mount(container){
    container.innerHTML=''
    const wrap = document.createElement('div'); wrap.className = `${NS}-wrap`
    const tools = document.createElement('div'); tools.className = `${NS}-tools`
    // Extra spacing so controls look centered/balanced
    Object.assign(tools.style, { display:'flex', alignItems:'center', gap:'16px', padding:'6px 0 10px' })
    // Switches for Pages ([[ ]]) and Tags (#) with larger description
    let showPages = true, showTags = true
    const help = document.createElement('div')
    help.textContent = 'Connections filter — turn [[pages]] or #tags on or off.'
    help.setAttribute('aria-live','polite')
    Object.assign(help.style, { fontSize:'inherit', color:'var(--color-muted,#666)', marginBottom:'10px' })

    function makeSwitch(labelText, initial){
      const group = document.createElement('div')
      group.className = 'mk-toggle-group'
      Object.assign(group.style, { display:'inline-flex', alignItems:'center', gap:'12px', marginRight:'20px' })
      const label = document.createElement('span'); label.textContent = labelText
      const btn = document.createElement('button')
      btn.className = 'mk-switch'
      btn.setAttribute('role','switch')
      btn.setAttribute('aria-checked', String(initial))
      btn.setAttribute('aria-label', `${labelText} visibility`)
      btn.innerHTML = '<span class="thumb" aria-hidden="true"></span>'
      group.append(label, btn)
      return { group, button: btn }
    }

    const pagesCtl = makeSwitch('Pages [[]]', true)
    const tagsCtl  = makeSwitch('Tags #', true)
    // Identify switches for styling (blue for pages, green for tags)
    pagesCtl.button.classList.add('mk-switch-pages')
    tagsCtl.button.classList.add('mk-switch-tags')
    tools.append(help, pagesCtl.group, tagsCtl.group)
    const canvas = document.createElement('canvas'); canvas.className = `${NS}-canvas`
    Object.assign(canvas.style, { width:'100%', height:'540px', background:'#fff', border:'1px solid var(--color-border,#e1e4e8)', borderRadius:'8px' })
    wrap.append(tools, canvas)
    container.appendChild(wrap)

    const ctx = canvas.getContext('2d')
    function resize(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; draw() }
    new ResizeObserver(resize).observe(canvas); setTimeout(resize, 0)

    let allNodes = []
    let nodes = allNodes
    let edges = []

    const colorFor = (n)=> n.kind==='tag' ? '#2dbf71' : '#2a6df4'
    const labelFor = (n)=> n.label || n.slug

    // Force simulation (very light)
    const strength = 0.04
    const repulse = 300
    const damping = 0.9

    // Center and scale
    function step(){
      // repulsion
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          const a=nodes[i], b=nodes[j]
          let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy + 0.01; let f=repulse/d2
          dx/=Math.sqrt(d2); dy/=Math.sqrt(d2)
          a.vx += dx*f; a.vy += dy*f; b.vx -= dx*f; b.vy -= dy*f
        }
      }
      // springs
      for(const e of edges){
        const a = nodes.find(n=>n.id===e.a), b = nodes.find(n=>n.id===e.b)
        if (!a || !b) continue
        const dx=b.x-a.x, dy=b.y-a.y
        a.vx += dx*strength; a.vy += dy*strength
        b.vx -= dx*strength; b.vy -= dy*strength
      }
      // integrate
      for(const n of nodes){ n.vx*=damping; n.vy*=damping; n.x+=n.vx*0.02; n.y+=n.vy*0.02 }
    }

    // pan/zoom
    let scale=1, tx=0, ty=0
    canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); const s=Math.exp(-e.deltaY*0.001); scale=Math.max(0.2, Math.min(3, scale*s)); draw() }, { passive:false })
    let dragging=null, dragOff={x:0,y:0}, panning=false, panStart={x:0,y:0}, panInit={x:0,y:0}
    function screenToWorld(x,y){ const cx=canvas.width/2, cy=canvas.height/2; return { x:(x-cx-tx)/scale, y:(y-cy-ty)/scale } }
    canvas.addEventListener('pointerdown', (e)=>{
      const r = canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; const w=screenToWorld(mx,my)
      // hit-test nodes
      const hit = nodes.find(n=>{ const dx=n.x-w.x, dy=n.y-w.y; return (dx*dx+dy*dy) < (10/scale)*(10/scale) })
      if (hit){ dragging=hit; dragOff={ x: hit.x - w.x, y: hit.y - w.y }
      } else { panning=true; panStart={x:mx,y:my}; panInit={x:tx,y:ty} }
    })
    window.addEventListener('pointerup', ()=>{ dragging=null; panning=false; draw() })
    window.addEventListener('pointermove', (e)=>{
      const r = canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top
      if (dragging){ const w=screenToWorld(mx,my); dragging.x = w.x + dragOff.x; dragging.y = w.y + dragOff.y; draw() }
      else if (panning){ tx = panInit.x + (mx-panStart.x); ty = panInit.y + (my-panStart.y); draw() }
    })
    canvas.addEventListener('dblclick', (e)=>{
      const r = canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; const w=screenToWorld(mx,my)
      const hit = nodes.find(n=>{ const dx=n.x-w.x, dy=n.y-w.y; return (dx*dx+dy*dy) < (10/scale)*(10/scale) })
      if (hit){ const evt = new CustomEvent('meetkit:event', { detail: { type:'openPage', slug: hit.slug } }); document.dispatchEvent(evt) }
    })

    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height)
      const cx=canvas.width/2, cy=canvas.height/2
      ctx.save(); ctx.translate(cx+tx, cy+ty); ctx.scale(scale, scale)
      // edges
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1/scale
      for(const e of edges){ const a=nodes.find(n=>n.id===e.a), b=nodes.find(n=>n.id===e.b); if(!a||!b) continue; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke() }
      // nodes
      for(const n of nodes){ ctx.beginPath(); ctx.fillStyle=colorFor(n); ctx.arc(n.x, n.y, 6, 0, Math.PI*2); ctx.fill() }
      // labels (only when zoomed in enough)
      if (scale>0.7){
        ctx.font = `${12/scale}px sans-serif`; ctx.fillStyle='#333'; ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=3/scale
        for(const n of nodes){ const text = labelFor(n); ctx.strokeText(text, n.x+8, n.y+4); ctx.fillText(text, n.x+8, n.y+4) }
      }
      ctx.restore()
    }

    // animate a few seconds to settle
    let t=0, anim=null
    function tick(){ for(let i=0;i<2;i++) step(); draw(); t++; if (t<600) anim=requestAnimationFrame(tick) }
    ;(async()=>{
      const data = await buildGraphFromNotes()
      allNodes = data.nodes.map(n=>({ ...n, x: Math.random()*10-5, y: Math.random()*10-5, vx:0, vy:0 }))
      nodes = allNodes
      edges = data.edges
      applyFilter()
      tick()
    })()

    // Toggle filtering between pages and tags
    function applyFilter(){
      nodes = allNodes.filter(n => (n.kind==='page' && showPages) || (n.kind==='tag' && showTags))
      draw()
    }
    function toggleSwitch(btn){
      const next = btn.getAttribute('aria-checked') !== 'true'
      btn.setAttribute('aria-checked', String(next))
      return next
    }
    function onKeyToggle(e, btn, setFn){
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFn(toggleSwitch(btn)); applyFilter() }
    }
    pagesCtl.button.addEventListener('click', ()=>{ showPages = toggleSwitch(pagesCtl.button); applyFilter() })
    pagesCtl.button.addEventListener('keydown', (e)=> onKeyToggle(e, pagesCtl.button, (v)=> showPages=v))
    tagsCtl.button.addEventListener('click', ()=>{ showTags = toggleSwitch(tagsCtl.button); applyFilter() })
    tagsCtl.button.addEventListener('keydown', (e)=> onKeyToggle(e, tagsCtl.button, (v)=> showTags=v))
  }

  window.meetkitGraph = { mount }
})();
