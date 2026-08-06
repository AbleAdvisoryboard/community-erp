import express from 'express'
import { getDb } from '../db/connection.js'
import { authenticate } from '../middleware/auth.js'
import { v4 as uuid } from 'uuid'

const r = express.Router()
r.use(express.json({ limit: '2mb' }))
r.use(authenticate)

function db(){ return getDb() }

// GET all saved daily notes for global references/graph views
r.get('/notes', (_req,res)=>{
  const rows = db()
    .prepare('SELECT date_iso, blocks_json, updated_at FROM meetkit_notes ORDER BY date_iso DESC')
    .all()
  res.json(rows.map((row) => {
    let parsed = { blocks: [] }
    try {
      parsed = JSON.parse(row.blocks_json || '{"blocks":[]}')
    } catch {}
    return {
      dateISO: row.date_iso,
      blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      updatedAt: row.updated_at,
    }
  }))
})

// GET a day's note
r.get('/notes/:dateISO', (req,res)=>{
  const row = db().prepare('SELECT blocks_json FROM meetkit_notes WHERE date_iso=?').get(req.params.dateISO)
  res.json(row ? JSON.parse(row.blocks_json) : { blocks: [] })
})

// PUT save a day's note
r.put('/notes/:dateISO', (req,res)=>{
  const { dateISO } = req.params
  const json = JSON.stringify(req.body || { blocks: [] })
  db().prepare(`
    INSERT INTO meetkit_notes(date_iso, blocks_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date_iso) DO UPDATE SET blocks_json=excluded.blocks_json, updated_at=CURRENT_TIMESTAMP
  `).run(dateISO, json)

  // naive FTS refresh (optional)
  try {
    db().prepare('DELETE FROM meetkit_notes_fts WHERE date_iso=?').run(dateISO)
    const content = Array.isArray(req.body?.blocks) ? req.body.blocks.map(b=>b.text||'').join('\n') : ''
    db().prepare('INSERT INTO meetkit_notes_fts(date_iso, content) VALUES (?, ?)').run(dateISO, content)
  } catch {}

  res.json({ ok:true })
})

// Pages
r.get('/pages', (_req,res)=>{
  const rows = db().prepare('SELECT slug, title, created_at, updated_at FROM meetkit_pages ORDER BY slug').all()
  res.json(rows)
})
r.post('/pages', (req,res)=>{
  const { slug, title } = req.body || {}
  if (!slug) return res.status(400).json({ message:'slug required' })
  db().prepare(`
    INSERT INTO meetkit_pages(slug,title,created_at,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET title=excluded.title, updated_at=CURRENT_TIMESTAMP
  `).run(slug, title || slug)
  res.json({ ok:true })
})

// Backlinks (bulk replace for a page)
r.put('/pages/:slug/backlinks', (req,res)=>{
  const { slug } = req.params
  const list = Array.isArray(req.body) ? req.body : []
  const del = db().prepare('DELETE FROM meetkit_backlinks WHERE page_slug=?')
  const ins = db().prepare('INSERT OR IGNORE INTO meetkit_backlinks(page_slug,date_iso,block_id,excerpt) VALUES (?,?,?,?)')
  const tx = db().transaction((rows)=>{ del.run(slug); rows.forEach(x=>ins.run(slug, x.dateISO, x.blockId, x.excerpt)) })
  tx(list)
  res.json({ ok:true, count:list.length })
})
r.get('/pages/:slug/backlinks', (req,res)=>{
  const rows = db().prepare('SELECT date_iso, block_id, excerpt FROM meetkit_backlinks WHERE page_slug=? ORDER BY date_iso DESC').all(req.params.slug)
  res.json(rows)
})

// Whiteboard
r.get('/whiteboard', (_req,res)=>{
  const row = db().prepare('SELECT strokes_json FROM meetkit_whiteboard WHERE id=1').get()
  res.json(row ? JSON.parse(row.strokes_json) : [])
})
r.put('/whiteboard', (req,res)=>{
  db().prepare(`
    INSERT INTO meetkit_whiteboard(id,strokes_json,updated_at)
    VALUES(1,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET strokes_json=excluded.strokes_json, updated_at=CURRENT_TIMESTAMP
  `).run(JSON.stringify(req.body || []))
  res.json({ ok:true })
})

// Map pins
r.get('/map/pins', (_req,res)=>{
  const rows = db().prepare('SELECT * FROM meetkit_map_pins ORDER BY created_at DESC').all()
  res.json(rows)
})
r.post('/map/pins', (req,res)=>{
  const id = uuid()
  const { lat, lng, title, body } = req.body || {}
  if (typeof lat !== 'number' || typeof lng !== 'number' || !title){
    return res.status(400).json({ message:'lat,lng,title required' })
  }
  db().prepare(`
    INSERT INTO meetkit_map_pins(id,lat,lng,title,body,created_at,updated_at)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(id, lat, lng, title, body||'')
  res.json({ ok:true, id })
})
r.delete('/map/pins/:id', (req,res)=>{
  db().prepare('DELETE FROM meetkit_map_pins WHERE id=?').run(req.params.id)
  res.json({ ok:true })
})

// Optional search endpoint
r.get('/search', (req,res)=>{
  const q = String(req.query.q||'').trim()
  if (!q) return res.json([])
  try {
    const noteHits = db().prepare(
      "SELECT date_iso, highlight(meetkit_notes_fts, 1, '<b>','</b>') AS snip FROM meetkit_notes_fts WHERE meetkit_notes_fts MATCH ? LIMIT 20"
    ).all(q.replace(/\s+/g,' AND '))
    const pageHits = db().prepare(
      "SELECT slug AS date_iso, title AS snip FROM meetkit_pages WHERE slug LIKE ? LIMIT 20"
    ).all(`%${q}%`)
    res.json([...noteHits, ...pageHits])
  } catch(e){ res.json([]) }
})

r.delete('/legacy-demo', (_req,res)=>{
  const dbi = db()
  const legacySlugs = ['clients/ashley', 'clients', 'location']
  const placeholders = legacySlugs.map(() => '?').join(',')
  const demoDates = dbi
    .prepare(
      `SELECT date_iso
         FROM meetkit_notes
        WHERE blocks_json LIKE '%[[Clients/Ashley]]%'
           OR blocks_json LIKE '%[[Location]]%'
           OR blocks_json LIKE '%Discuss onboarding plan #priority%'
           OR blocks_json LIKE '%Send proposal to [[Clients/Ashley]]%'`
    )
    .all()
    .map((row) => row.date_iso)

  const tx = dbi.transaction(() => {
    if (demoDates.length) {
      dbi.prepare(
        `DELETE FROM meetkit_notes WHERE date_iso IN (${demoDates.map(() => '?').join(',')})`
      ).run(...demoDates)
      try {
        dbi.prepare(
          `DELETE FROM meetkit_notes_fts WHERE date_iso IN (${demoDates.map(() => '?').join(',')})`
        ).run(...demoDates)
      } catch {}
    }

    dbi.prepare(`DELETE FROM meetkit_backlinks WHERE lower(page_slug) IN (${placeholders})`).run(...legacySlugs)
    dbi.prepare(`DELETE FROM meetkit_pages WHERE lower(slug) IN (${placeholders})`).run(...legacySlugs)
    dbi.prepare("DELETE FROM meetkit_map_pins WHERE title = 'Client NYC' AND body = 'Kickoff next week'").run()

    const whiteboardRow = dbi.prepare('SELECT strokes_json FROM meetkit_whiteboard WHERE id=1').get()
    if (isLegacyDemoWhiteboardJson(whiteboardRow?.strokes_json)) {
      dbi.prepare("UPDATE meetkit_whiteboard SET strokes_json = '[]', updated_at = CURRENT_TIMESTAMP WHERE id = 1").run()
    }
  })
  tx()

  res.json({ ok:true })
})

function isLegacyDemoWhiteboardJson(value){
  try {
    const parsed = JSON.parse(value || '[]')
    const strokes = Array.isArray(parsed) ? parsed : parsed?.strokes
    const stroke = strokes?.[0]
    return Array.isArray(strokes)
      && strokes.length === 1
      && stroke?.tool === 'pen'
      && stroke?.w === 3
      && stroke?.color === '#111'
      && Array.isArray(stroke?.pts)
      && stroke.pts.length === 3
      && stroke.pts[0]?.x === 20
      && stroke.pts[0]?.y === 20
  } catch {
    return false
  }
}

export default r

// Admin export (JSON)
r.get('/export', (_req,res)=>{
  const dbi = db()
  const dump = {
    pages: dbi.prepare('SELECT slug, title, created_at, updated_at FROM meetkit_pages').all(),
    notes: dbi.prepare('SELECT date_iso, blocks_json FROM meetkit_notes').all().map(r=>({ date_iso: r.date_iso, blocks: (JSON.parse(r.blocks_json||'{}').blocks)||[] })),
    backlinks: dbi.prepare('SELECT page_slug, date_iso, block_id, excerpt FROM meetkit_backlinks').all(),
    whiteboard: (dbi.prepare('SELECT strokes_json FROM meetkit_whiteboard WHERE id=1').get()?.strokes_json) || '[]',
    pins: dbi.prepare('SELECT * FROM meetkit_map_pins').all()
  }
  res.setHeader('Content-Type','application/json')
  res.setHeader('Content-Disposition','attachment; filename="meetkit-export.json"')
  res.end(JSON.stringify(dump, null, 2))
})
