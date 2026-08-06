;(function(){
  const { getState } = window.meetkitStorage
  const sync = window.meetkitSync

  function mount(container){
    container.innerHTML = ''
    const toolbar = document.createElement('div'); toolbar.className='meetkit-whiteboard-toolbar'
    const penBtn = document.createElement('button'); penBtn.textContent='Pen'; penBtn.setAttribute('aria-label','Pen tool')
    const eraseBtn = document.createElement('button'); eraseBtn.textContent='Eraser'; eraseBtn.setAttribute('aria-label','Eraser tool')
    const widthInput = document.createElement('input'); widthInput.type='range'; widthInput.min='1'; widthInput.max='20'; widthInput.value='3'; widthInput.setAttribute('aria-label','Stroke width')
    const clearBtn = document.createElement('button'); clearBtn.textContent='Clear'; clearBtn.setAttribute('aria-label','Clear whiteboard')
    const exportBtn = document.createElement('button'); exportBtn.textContent='Export PNG'; exportBtn.setAttribute('aria-label','Export PNG')
    // Color palette (5 colors)
    const colors = ['#111111', '#2a6df4', '#e5534b', '#2dbf71', '#f0ad00']
    const colorBtns = colors.map((c, idx)=>{
      const b = document.createElement('button'); b.className='meetkit-color'; b.style.background=c; b.setAttribute('aria-label', `Color ${idx+1}`); b.setAttribute('title', c)
      b.setAttribute('aria-pressed','false')
      return b
    })
    toolbar.append(penBtn, eraseBtn, widthInput, ...colorBtns, clearBtn, exportBtn)

    const canvas = document.createElement('canvas'); canvas.className='meetkit-whiteboard-canvas'
    const wrap = document.createElement('div')
    wrap.append(toolbar, canvas)
    container.appendChild(wrap)

    const ctx = canvas.getContext('2d')
    function resize(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; redraw() }
    new ResizeObserver(resize).observe(canvas)
    setTimeout(resize, 0)

    let drawing = false
    let mode = 'pen'
    let currentColor = colors[0]
    let strokes = (getState().whiteboard?.strokes)||[]

    function pointerPos(e){ const r = canvas.getBoundingClientRect(); return { x: (e.clientX-r.left), y: (e.clientY-r.top) } }

    function start(e){ drawing=true; const p = pointerPos(e); const color = (mode==='eraser') ? '#ffffff' : currentColor; strokes.push({ tool: mode, w: Number(widthInput.value), color, pts:[p] }); redraw(); saveThrottled() }
    function move(e){ if(!drawing) return; const p = pointerPos(e); const s = strokes[strokes.length-1]; s.pts.push(p); redraw(); }
    function end(){ drawing=false; saveThrottled() }

    canvas.addEventListener('pointerdown', start)
    canvas.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    penBtn.addEventListener('click', ()=>{ mode='pen' })
    eraseBtn.addEventListener('click', ()=>{ mode='eraser' })
    colorBtns.forEach((b, i)=>{
      b.addEventListener('click', ()=>{
        mode='pen'
        currentColor = colors[i]
        colorBtns.forEach(x=> x.setAttribute('aria-pressed','false'))
        b.setAttribute('aria-pressed','true')
      })
    })
    clearBtn.addEventListener('click', ()=>{
      if (!confirm('Clear the whiteboard? This will overwrite the saved board.')) return;
      strokes.length = 0; redraw(); saveThrottled(true)
    })
    function todayISO(){ return new Date().toISOString().slice(0,10) }
    function currentDateISO(){ const qp=new URLSearchParams(location.search).get('date'); return (/^\d{4}-\d{2}-\d{2}$/.test(qp||'')) ? qp : todayISO() }
    function currentTime(){ const d=new Date(); const p=(n)=> String(n).padStart(2,'0'); return `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}` }
    function uid(){ return 'b_' + Math.random().toString(36).slice(2,9) }
    function ensurePngName(name){ name=String(name||'').trim(); if(!name) return `whiteboard-${currentDateISO()}.png`; return /\.png$/i.test(name)? name : `${name}.png` }
    // lightweight toast utility
    function toast(msg){
      try {
        let t=document.querySelector('.meetkit-toast')
        if(!t){ t=document.createElement('div'); t.className='meetkit-toast'; document.body.appendChild(t) }
        t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1200)
      } catch {}
    }

    exportBtn.addEventListener('click', async ()=>{
      const suggested = `whiteboard-${currentDateISO()}-${currentTime()}.png`
      const name = ensurePngName(window.prompt('File name for export (.png):', suggested) || suggested)
      try {
        const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download=name; a.click()
      } catch {}
      // Append a note in the meeting for the current date
      try {
        const d = currentDateISO()
        let note = await (sync.load?.(d) || Promise.resolve({ blocks: [] }))
        if (!note || typeof note !== 'object') note = { blocks: [] }
        if (!Array.isArray(note.blocks)) note.blocks = []
        note.blocks.push({ id: uid(), text: `${name} white board saved`, children: [] })
        await (sync.save?.(d, note) || Promise.resolve())
        toast(`Exported ${name} and noted in journal`)
      } catch {}
    })

    function redraw(){
      ctx.clearRect(0,0,canvas.width,canvas.height)
      for(const s of strokes){
        if (s.pts.length<2) continue
        ctx.lineWidth = s.w
        ctx.lineJoin = 'round'; ctx.lineCap='round'
        ctx.strokeStyle = s.tool==='eraser' ? '#fff' : (s.color||'#111')
        ctx.beginPath(); ctx.moveTo(s.pts[0].x, s.pts[0].y)
        for(let i=1;i<s.pts.length;i++){ ctx.lineTo(s.pts[i].x, s.pts[i].y) }
        ctx.stroke()
      }
    }

    let t=null
    function saveThrottled(immediate=false){
      if (immediate){ clearTimeout(t); sync.saveWhiteboard({ strokes }); return }
      clearTimeout(t); t=setTimeout(()=>sync.saveWhiteboard({ strokes }), 500)
    }

    // initial draw
    redraw()
  }

  window.meetkitWhiteboard = { mount }
})();
