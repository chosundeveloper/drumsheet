import { useMemo, useRef, useState } from 'react'
import './App.css'

const NOTE_ROWS = [
  { id: 'hh', name: 'Hi-hat', row: 0, shape: 'x', stem: 'up' },
  { id: 'sn', name: 'Snare', row: 4, shape: 'circle', stem: 'up' },
  { id: 'ht', name: 'High tom', row: 5, shape: 'circle', stem: 'up' },
  { id: 'bd', name: 'Kick', row: 8, shape: 'circle', stem: 'down' },
] as const

type NoteRow = (typeof NOTE_ROWS)[number]
type NoteRowId = NoteRow['id']

type PlacedNote = {
  column: number
  rowId: NoteRowId
}

const STAFF = {
  width: 920,
  paddingX: 72,
  paddingY: 48,
  lineSpacing: 28,
  lines: 5,
  subdivisions: 16,
  beats: 4,
} as const

const topLineY = STAFF.paddingY
const noteStep = STAFF.lineSpacing / 2
const staffHeight =
  STAFF.paddingY * 2 + STAFF.lineSpacing * (STAFF.lines - 1)
const contentWidth = STAFF.width - STAFF.paddingX * 2
const columnStep =
  STAFF.subdivisions > 1 ? contentWidth / (STAFF.subdivisions - 1) : contentWidth

const staffLines = Array.from(
  { length: STAFF.lines },
  (_, index) => topLineY + index * STAFF.lineSpacing,
)

const columns = Array.from({ length: STAFF.subdivisions }, (_, index) => index)

const beatMarkers = Array.from({ length: STAFF.beats }, (_, index) => index)

const yForRow = (row: number) => topLineY + (row - 1) * noteStep
const xForColumn = (column: number) => STAFF.paddingX + column * columnStep

const MAX_HOVER_DISTANCE = noteStep * 1.25

function App() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [notes, setNotes] = useState<PlacedNote[]>([])
  const [hoverSlot, setHoverSlot] = useState<PlacedNote | null>(null)

  const rowsById = useMemo(() => {
    const map = new Map<NoteRowId, NoteRow>()
    NOTE_ROWS.forEach((row) => map.set(row.id, row))
    return map
  }, [])

  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.column === b.column) {
          return NOTE_ROWS.findIndex((row) => row.id === a.rowId) -
            NOTE_ROWS.findIndex((row) => row.id === b.rowId)
        }
        return a.column - b.column
      }),
    [notes],
  )

  const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = STAFF.width / rect.width
    const scaleY = staffHeight / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    const rawColumn = (x - STAFF.paddingX) / columnStep
    const column = Math.round(rawColumn)

    if (column < 0 || column >= STAFF.subdivisions) {
      setHoverSlot(null)
      return
    }

    let closestRow: NoteRow | null = null
    let smallestDistance = Number.POSITIVE_INFINITY

    for (const row of NOTE_ROWS) {
      const rowY = yForRow(row.row)
      const distance = Math.abs(rowY - y)
      if (distance < smallestDistance) {
        smallestDistance = distance
        closestRow = row
      }
    }

    if (!closestRow || smallestDistance > MAX_HOVER_DISTANCE) {
      setHoverSlot(null)
      return
    }

    setHoverSlot({ column, rowId: closestRow.id })
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
  }

  const handleClick = () => {
    if (!hoverSlot) {
      return
    }

    setNotes((current) => {
      const exists = current.some(
        (note) => note.column === hoverSlot.column && note.rowId === hoverSlot.rowId,
      )
      if (exists) {
        return current
      }
      return [...current, hoverSlot]
    })
  }

  const handleClear = () => {
    setNotes([])
  }

  const renderNote = (note: PlacedNote, key: string, isPreview = false) => {
    const row = rowsById.get(note.rowId)
    if (!row) {
      return null
    }

    const x = xForColumn(note.column)
    const y = yForRow(row.row)
    const stemLength = noteStep * 3
    const groupClass = isPreview ? 'note preview' : 'note'
    const headClass = isPreview ? 'note-head preview' : 'note-head'
    const stemClass = isPreview ? 'note-stem preview' : 'note-stem'
    const crossClass = isPreview ? 'note-x preview' : 'note-x'

    return (
      <g key={key} className={groupClass}>
        {row.shape === 'circle' ? (
          <ellipse cx={x} cy={y} rx={8.5} ry={6.5} className={headClass} />
        ) : (
          <>
            <line x1={x - 6} y1={y - 6} x2={x + 6} y2={y + 6} className={crossClass} />
            <line x1={x - 6} y1={y + 6} x2={x + 6} y2={y - 6} className={crossClass} />
          </>
        )}
        {row.stem === 'up' ? (
          <line
            x1={x + 8}
            y1={y}
            x2={x + 8}
            y2={y - stemLength}
            className={stemClass}
          />
        ) : (
          <line
            x1={x - 8}
            y1={y}
            x2={x - 8}
            y2={y + stemLength}
            className={stemClass}
          />
        )}
      </g>
    )
  }

  return (
    <div className="app">
      <div className="intro">
        <h1>Drum staff sketch</h1>
        <p>
          Click anywhere on the five-line staff to drop a percussion note. Notes snap to the
          nearest voice and sixteenth-note grid so you can sketch grooves quickly.
        </p>
        <div className="controls">
          <button type="button" onClick={handleClear} disabled={notes.length === 0}>
            Clear measure
          </button>
        </div>
      </div>

      <div className="staff-card">
        <svg
          ref={svgRef}
          className="staff"
          viewBox={`0 0 ${STAFF.width} ${staffHeight}`}
          onMouseMove={handlePointerMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          <rect
            x={32}
            y={24}
            width={STAFF.width - 64}
            height={staffHeight - 48}
            className="staff-surface"
            rx={16}
          />

          {columns.map((column) => {
            const x = xForColumn(column)
            const isBeatMarker = column % (STAFF.subdivisions / STAFF.beats) === 0
            if (column === 0 || column === STAFF.subdivisions - 1) {
              return null
            }

            return (
              <line
                key={`col-${column}`}
                x1={x}
                y1={topLineY - noteStep * 2}
                x2={x}
                y2={staffHeight - STAFF.paddingY + noteStep * 2}
                className={isBeatMarker ? 'grid-line beat' : 'grid-line subdivision'}
              />
            )
          })}

          {staffLines.map((y, index) => (
            <line
              key={`line-${index}`}
              x1={STAFF.paddingX - 24}
              y1={y}
              x2={STAFF.width - STAFF.paddingX + 24}
              y2={y}
              className="staff-line"
            />
          ))}

          {beatMarkers.map((beat) => {
            const column = beat * (STAFF.subdivisions / STAFF.beats)
            const x = xForColumn(column)
            return (
              <text key={`beat-${beat}`} x={x} y={topLineY - noteStep * 2.7} className="beat-label">
                {beat + 1}
              </text>
            )
          })}

          {sortedNotes.map((note, index) =>
            renderNote(note, `note-${index}-${note.column}-${note.rowId}`),
          )}

          {hoverSlot && renderNote(hoverSlot, 'preview', true)}
        </svg>

        <div className="legend">
          <span className="legend-title">Voices</span>
          <div className="legend-items">
            {NOTE_ROWS.map((row) => (
              <div key={row.id} className="legend-item">
                <svg width="26" height="26" viewBox="0 0 50 50">
                  {row.shape === 'circle' ? (
                    <ellipse
                      cx={25}
                      cy={25}
                      rx={11}
                      ry={8}
                      className="legend-head"
                    />
                  ) : (
                    <>
                      <line x1={16} y1={16} x2={34} y2={34} className="legend-x" />
                      <line x1={16} y1={34} x2={34} y2={16} className="legend-x" />
                    </>
                  )}
                </svg>
                <span>{row.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
