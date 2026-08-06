;(function(){
  const linkRe = /\[\[([^\]]+)\]\]/g
  const tagRe = /(^|\s)#([A-Za-z0-9_\-\/]+)/g

  function slugify(s){
    return String(s).trim().replace(/\s+/g,'-').replace(/[^A-Za-z0-9_\-\/]/g,'').toLowerCase()
  }

  function parseLinks(text){
    const out = []
    String(text).replace(linkRe, (_,inner)=>{
      const disp = inner.trim()
      const slug = slugify(inner)
      out.push({ slug, text: disp })
      return ''
    })
    return out
  }

  function parseTags(text){
    const tags = []
    let m
    const s = String(text)
    while((m = tagRe.exec(s))){ tags.push(m[2]) }
    return tags
  }

  function toggleCheckbox(line){
    const s = String(line)
    if (s.startsWith('- [ ]')) return s.replace('- [ ]','- [x]')
    if (s.startsWith('- [x]')) return s.replace('- [x]','- [ ]')
    return s
  }

  function renderInline(text){
    return String(text || '')
      .replace(tagRe, (m, pre, tag) => `${pre}<span class="meetkit-tag">#${tag}</span>`)
      .replace(linkRe, (_, p) => `<a href="#" class="meetkit-page" data-page="${p}">[[${p}]]</a>`)
  }

  // click delegation for links to dispatch openPage
  document.addEventListener('click', (e)=>{
    const a1 = e.target.closest('[data-meetkit-link]')
    if (a1){
      e.preventDefault()
      const slug = a1.getAttribute('data-slug')
      const evt = new CustomEvent('meetkit:event', { detail: { type:'openPage', slug }})
      document.dispatchEvent(evt)
      return
    }
    const a2 = e.target.closest('a.meetkit-page')
    if (a2){
      e.preventDefault()
      const slug = a2.getAttribute('data-page')
      const evt = new CustomEvent('meetkit:event', { detail: { type:'openPage', slug }})
      document.dispatchEvent(evt)
      window.dispatchEvent(new CustomEvent('openPage', { detail: { slug } }))
    }
  })

  window.meetkitParser = { parseLinks, parseTags, toggleCheckbox, renderInline }
})();

