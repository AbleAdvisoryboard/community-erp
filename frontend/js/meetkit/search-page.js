;(function(){
  function el(id){ return document.getElementById(id) }
  const input = ()=> el('search-input')
  const results = ()=> el('search-results')

  function renderList(items){
    const c = results(); c.innerHTML = ''
    if (!items.length){ c.innerHTML = '<div style="opacity:.6;padding:6px;">No results</div>'; return }
    for(const r of items){
      const row = document.createElement('div')
      row.style.cssText = 'padding:8px;border-bottom:1px solid var(--color-border);cursor:pointer;border-radius:6px;'
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(r.date_iso)
      row.innerHTML = `${isDate?'📅':'📄'} <strong>${r.date_iso}</strong> <span style="opacity:.7;margin-left:6px;">${r.snip||''}</span>`
      row.addEventListener('click', ()=> go(r))
      c.appendChild(row)
    }
  }

  function go(item){
    const dateIso = item.date_iso
    const url = `/frontend/html/meetings.html${/^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? ('?date='+encodeURIComponent(dateIso)) : ''}`
    window.location.href = url
  }

  async function doSearch(q){
    try{ const items = await (window.meetkitSync.search?.(q) || []); renderList(items) } catch { renderList([]) }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    input().addEventListener('input', ()=> doSearch(input().value))
    doSearch('')
  })
})();

