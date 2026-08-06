;(function(){
  const KEY = 'meetkit_v1'
  const DEFAULT_STATE = {
    pages: {},
    notes: {},
    backlinks: {},
    whiteboard: { strokes: [], updatedAt: 0 },
    map: { pins: [] },
    ui: { cursors: {} }
  }

  function deepMerge(target, source){
    if (typeof target !== 'object' || target === null) return source
    if (typeof source !== 'object' || source === null) return source
    const out = Array.isArray(target) ? target.slice() : { ...target }
    for (const [k,v] of Object.entries(source)){
      if (Array.isArray(v)) out[k] = v.slice()
      else if (typeof v === 'object' && v) out[k] = deepMerge(out[k] ?? {}, v)
      else out[k] = v
    }
    return out
  }

  function safeParse(json){
    try { return JSON.parse(json) } catch { return null }
  }

  function load(){
    const raw = localStorage.getItem(KEY)
    const parsed = safeParse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE }
    return deepMerge(DEFAULT_STATE, parsed)
  }

  let state = load()

  function save(){
    const json = JSON.stringify(state)
    try { localStorage.setItem(KEY, json) }
    catch(err){
      console.warn('Meetkit: localStorage quota hit', err)
      try {
        // optional heuristic: drop old whiteboard strokes if massive
        if ((state.whiteboard?.strokes||[]).length > 2000){
          state.whiteboard.strokes = state.whiteboard.strokes.slice(-500)
          localStorage.setItem(KEY, JSON.stringify(state))
        }
      } catch {}
    }
  }

  let saveTimer = null
  function scheduleSave(delay=500){
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, delay)
  }

  function getState(){ return state }
  function setState(patch){ state = deepMerge(state, patch); scheduleSave() }

  // simple pub/sub for local events
  const subs = new Set()
  function subscribe(fn){ subs.add(fn); return () => subs.delete(fn) }
  function publish(evt){ for(const fn of subs) try { fn(evt) } catch(e){ console.error(e) } }

  // expose API
  window.meetkitStorage = { KEY, getState, setState, save, load: () => { state = load(); return state }, deepMerge, subscribe, publish }
})();
