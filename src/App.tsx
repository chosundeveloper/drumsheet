import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

const NOTE_ROWS = [
  { id: 'hh', name: 'Hi-hat', row: 0, shape: 'x', stem: 'up' },
  { id: 'sn', name: 'Snare', row: 4, shape: 'circle', stem: 'up' },
  { id: 'ht', name: 'High tom', row: 5, shape: 'circle', stem: 'up' },
  { id: 'bd', name: 'Kick', row: 8, shape: 'circle', stem: 'down' },
] as const

type NoteRow = (typeof NOTE_ROWS)[number]
type NoteRowId = NoteRow['id']

type MeasureNote = {
  column: number
  rowId: NoteRowId
}

type HoverSlot = {
  measure: number
  column: number
  columnInMeasure: number
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

const COLUMN_STEP =
  (STAFF.width - STAFF.paddingX * 2) / (STAFF.subdivisions - 1)
const topLineY = STAFF.paddingY
const noteStep = STAFF.lineSpacing / 2
const staffHeight =
  STAFF.paddingY * 2 + STAFF.lineSpacing * (STAFF.lines - 1)

const yForRow = (row: number) => topLineY + (row - 1) * noteStep
const xForColumn = (column: number) => STAFF.paddingX + column * COLUMN_STEP

const MAX_HOVER_DISTANCE = noteStep * 1.25

const ZOOM = {
  min: 1,
  max: 1.8,
  step: 0.05,
  default: 1.45,
} as const

function App() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [measures, setMeasures] = useState<MeasureNote[][]>([[]])
  const [currentMeasure, setCurrentMeasure] = useState(0)
  const [clipboard, setClipboard] = useState<MeasureNote[] | null>(null)
  const [hoverSlot, setHoverSlot] = useState<HoverSlot | null>(null)
  const [zoom, setZoom] = useState<number>(ZOOM.default)

  const measureSize = STAFF.subdivisions
  const totalMeasures = measures.length
  const totalColumns = totalMeasures * measureSize
  const staffWidth =
    totalColumns > 1
      ? STAFF.paddingX * 2 + COLUMN_STEP * (totalColumns - 1)
      : STAFF.width

  const scaledWidth = Math.round(staffWidth * zoom)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  const rowsById = useMemo(() => {
    const map = new Map<NoteRowId, NoteRow>()
    NOTE_ROWS.forEach((row) => map.set(row.id, row))
    return map
  }, [])

  const renderNotes = useMemo(
    () =>
      measures.flatMap((measureNotes, measureIndex) =>
        measureNotes.map((note) => ({
          column: note.column + measureIndex * measureSize,
          rowId: note.rowId,
        })),
      ),
    [measures, measureSize],
  )

  const sortedNotes = useMemo(() => {
    const notesCopy = [...renderNotes]
    notesCopy.sort((a, b) => {
      if (a.column === b.column) {
        return (
          NOTE_ROWS.findIndex((row) => row.id === a.rowId) -
          NOTE_ROWS.findIndex((row) => row.id === b.rowId)
        )
      }
      return a.column - b.column
    })
    return notesCopy
  }, [renderNotes])

  const columns = useMemo(
    () => Array.from({ length: totalColumns }, (_, index) => index),
    [totalColumns],
  )

  const beatMarkers = useMemo(
    () => Array.from({ length: totalMeasures * STAFF.beats }, (_, index) => index),
    [totalMeasures],
  )

  const currentMeasureNotes = measures[currentMeasure] ?? []
  const hasClipboard = clipboard !== null && clipboard.length > 0

  const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = staffWidth / rect.width
    const scaleY = staffHeight / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    const rawColumn = (x - STAFF.paddingX) / COLUMN_STEP
    const column = Math.round(rawColumn)

    if (column < 0 || column >= totalColumns) {
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

    const measure = Math.floor(column / measureSize)
    const columnInMeasure = column % measureSize

    setHoverSlot({ measure, column, columnInMeasure, rowId: closestRow.id })
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
  }

  const handleClick = () => {
    if (!hoverSlot) {
      return
    }

    setMeasures((current) => {
      const next = current.map((notes) => [...notes])
      const measureNotes = next[hoverSlot.measure] ?? []
      const exists = measureNotes.some(
        (note) => note.column === hoverSlot.columnInMeasure && note.rowId === hoverSlot.rowId,
      )
      if (exists) {
        return next
      }
      next[hoverSlot.measure] = [
        ...measureNotes,
        { column: hoverSlot.columnInMeasure, rowId: hoverSlot.rowId },
      ]
      return next
    })
  }

  const handleClear = () => {
    if (currentMeasureNotes.length === 0) {
      return
    }
    setMeasures((current) =>
      current.map((measureNotes, index) => (index === currentMeasure ? [] : measureNotes)),
    )
    setHoverSlot(null)
  }

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    setZoom(Number(event.target.value))
  }

  const handlePrevMeasure = () => {
    setCurrentMeasure((index) => Math.max(0, index - 1))
    setHoverSlot(null)
  }

  const handleNextMeasure = () => {
    setCurrentMeasure((index) => Math.min(totalMeasures - 1, index + 1))
    setHoverSlot(null)
  }

  const handleAddMeasure = () => {
    setMeasures((current) => {
      const next = [...current, []]
      setCurrentMeasure(next.length - 1)
      return next
    })
    setHoverSlot(null)
  }

  const handleCopyMeasure = () => {
    const measureNotes = measures[currentMeasure] ?? []
    setClipboard(measureNotes.map((note) => ({ ...note })))
  }

  const handlePasteMeasure = () => {
    if (!clipboard) {
      return
    }
    setMeasures((current) =>
      current.map((measureNotes, index) =>
        index === currentMeasure
          ? clipboard.map((note) => ({ ...note }))
          : measureNotes,
      ),
    )
    setHoverSlot(null)
  }

  const renderNote = (note: { column: number; rowId: NoteRowId }, key: string, isPreview = false) => {
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
          Sketch grooves with percussion note heads that snap to the correct voices and
          subdivisions. Use the controls below to resize the staff, manage measures, and copy or
          paste ideas.
        </p>
        <div className="controls">
          <label className="zoom-control">
            <span>Staff size</span>
            <input
              type="range"
              min={ZOOM.min}
              max={ZOOM.max}
              step={ZOOM.step}
              value={zoom}
              onChange={handleZoomChange}
              aria-label="Adjust staff size"
            />
            <span className="zoom-control-value">{zoomLabel}</span>
          </label>
          <button
            type="button"
            className="pill-button"
            onClick={handleClear}
            disabled={currentMeasureNotes.length === 0}
          >
            Clear measure
          </button>
        </div>

        <div className="measure-controls">
          <div className="measure-navigation">
            <button
              type="button"
              className="pill-button"
              onClick={handlePrevMeasure}
              disabled={currentMeasure === 0}
            >
              ◀ Prev
            </button>
            <span className="measure-indicator">
              Measure {currentMeasure + 1} / {totalMeasures}
            </span>
            <button
              type="button"
              className="pill-button"
              onClick={handleNextMeasure}
              disabled={currentMeasure === totalMeasures - 1}
            >
              Next ▶
            </button>
          </div>
          <div className="measure-actions">
            <button type="button" className="pill-button" onClick={handleAddMeasure}>
              Add measure
            </button>
            <button
              type="button"
              className="pill-button"
              onClick={handleCopyMeasure}
              disabled={currentMeasureNotes.length === 0}
            >
              Copy measure
            </button>
            <button
              type="button"
              className="pill-button"
              onClick={handlePasteMeasure}
              disabled={!hasClipboard}
            >
              Paste here
            </button>
          </div>
        </div>
      </div>

      <div className="staff-card">
        <svg
          ref={svgRef}
          className="staff"
          viewBox={`0 0 ${staffWidth} ${staffHeight}`}
          onMouseMove={handlePointerMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ width: `${scaledWidth}px`, maxWidth: '100%' }}
        >
          <rect
            x={32}
            y={24}
            width={staffWidth - 64}
            height={staffHeight - 48}
            className="staff-surface"
            rx={16}
          />

          {columns.map((column) => {
            if (column === 0 || column === totalColumns - 1) {
              return null
            }
            const x = xForColumn(column)
            const isBeatMarker = column % (STAFF.subdivisions / STAFF.beats) === 0
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

          {Array.from({ length: STAFF.lines }, (_, index) => topLineY + index * STAFF.lineSpacing).map(
            (y, index) => (
              <line
                key={`line-${index}`}
                x1={STAFF.paddingX - 24}
                y1={y}
                x2={staffWidth - STAFF.paddingX + 24}
                y2={y}
                className="staff-line"
              />
            ),
          )}

          {beatMarkers.map((beat) => {
            const column = beat * (STAFF.subdivisions / STAFF.beats)
            const x = xForColumn(column)
            const beatNumber = (beat % STAFF.beats) + 1
            return (
              <text key={`beat-${beat}`} x={x} y={topLineY - noteStep * 2.7} className="beat-label">
                {beatNumber}
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
