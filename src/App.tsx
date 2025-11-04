import { useMemo, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
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
  duration: number
}

type Measure = {
  subdivisions: number
  notes: MeasureNote[]
}

type HoverSlot = {
  measureIndex: number
  column: number
  columnInMeasure: number
  rowId: NoteRowId
  duration: number
  rowStart: number
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

const DEFAULT_SUBDIVISIONS = STAFF.subdivisions
const MEASURES_PER_ROW = 4

const baseContentWidth = STAFF.width - STAFF.paddingX * 2
const COLUMN_STEP = baseContentWidth / (STAFF.subdivisions - 1)
const topLineY = STAFF.paddingY
const noteStep = STAFF.lineSpacing / 2
const staffHeight =
  STAFF.paddingY * 2 + STAFF.lineSpacing * (STAFF.lines - 1)

const MAX_HOVER_DISTANCE = noteStep * 1.25

const rowsById = new Map<NoteRowId, NoteRow>()
const rowOrder = new Map<NoteRowId, number>()
NOTE_ROWS.forEach((row, index) => {
  rowsById.set(row.id, row)
  rowOrder.set(row.id, index)
})

const DURATION_OPTIONS = [
  { value: 1, label: 'Sixteenth', symbol: '♬' },
  { value: 2, label: 'Eighth', symbol: '♪' },
] as const

type DurationOption = (typeof DURATION_OPTIONS)[number]

const xForColumnInRow = (column: number, rowStart: number) =>
  STAFF.paddingX + (column - rowStart) * COLUMN_STEP
const yForRow = (row: number) => topLineY + (row - 1) * noteStep

const computeRowWidth = (subdivisions: number) =>
  STAFF.paddingX * 2 + COLUMN_STEP * Math.max(subdivisions - 1, 0)

function App() {
  const [measures, setMeasures] = useState<Measure[]>([
    { subdivisions: DEFAULT_SUBDIVISIONS, notes: [] },
  ])
  const [currentMeasure, setCurrentMeasure] = useState(0)
  const [clipboard, setClipboard] = useState<Measure | null>(null)
  const [hoverSlot, setHoverSlot] = useState<HoverSlot | null>(null)
  const [zoom, setZoom] = useState(1.45)
  const [selectedDuration, setSelectedDuration] = useState<DurationOption['value']>(1)

  const measureOffsets = useMemo(() => {
    const offsets: Array<{ start: number; subdivisions: number }> = []
    let cursor = 0
    measures.forEach((measure) => {
      offsets.push({ start: cursor, subdivisions: measure.subdivisions })
      cursor += measure.subdivisions
    })
    return offsets
  }, [measures])

  const rows = useMemo(() => {
    if (measures.length === 0) {
      return [] as Array<{
        rowIndex: number
        start: number
        subdivisions: number
        measureStartIndex: number
        measureCount: number
      }>
    }

    const result: Array<{
      rowIndex: number
      start: number
      subdivisions: number
      measureStartIndex: number
      measureCount: number
    }> = []

    for (let measureStartIndex = 0; measureStartIndex < measures.length; measureStartIndex += MEASURES_PER_ROW) {
      const slice = measures.slice(measureStartIndex, measureStartIndex + MEASURES_PER_ROW)
      const start = measureOffsets[measureStartIndex]?.start ?? 0
      const subdivisions = slice.reduce((total, measure) => total + measure.subdivisions, 0)
      result.push({
        rowIndex: result.length,
        start,
        subdivisions,
        measureStartIndex,
        measureCount: slice.length,
      })
    }

    return result
  }, [measureOffsets, measures])

  const zoomLabel = `${Math.round(zoom * 100)}%`

  const beatMarkersByRow = useMemo(() => {
    return rows.map((row) => {
      const markers: Array<{ position: number; label: number }> = []
      for (let offsetIndex = row.measureStartIndex; offsetIndex < row.measureStartIndex + row.measureCount; offsetIndex += 1) {
        const measure = measures[offsetIndex]
        if (!measure) {
          continue
        }
        const offset = measureOffsets[offsetIndex]
        if (!offset) {
          continue
        }
        const unitsPerBeat = measure.subdivisions / STAFF.beats
        for (let beat = 0; beat < STAFF.beats; beat += 1) {
          const position = offset.start + unitsPerBeat * beat
          markers.push({ position, label: beat + 1 })
        }
      }
      return markers
    })
  }, [measureOffsets, measures, rows])

  const flattenedNotes = useMemo(() => {
    const flattened: Array<{ column: number; rowId: NoteRowId; duration: number }> = []
    measures.forEach((measure, measureIndex) => {
      const offset = measureOffsets[measureIndex]?.start ?? 0
      measure.notes.forEach((note) => {
        flattened.push({
          column: offset + note.column,
          rowId: note.rowId,
          duration: note.duration,
        })
      })
    })
    flattened.sort((a, b) => {
      if (a.column !== b.column) {
        return a.column - b.column
      }
      const orderA = rowOrder.get(a.rowId) ?? 0
      const orderB = rowOrder.get(b.rowId) ?? 0
      return orderA - orderB
    })
    return flattened
  }, [measureOffsets, measures])

  const currentMeasureNotes = measures[currentMeasure]?.notes ?? []
  const hasClipboard = clipboard !== null && clipboard.notes.length > 0

  const locateMeasure = (column: number) => {
    for (let index = 0; index < measureOffsets.length; index += 1) {
      const { start, subdivisions } = measureOffsets[index]
      if (column >= start && column < start + subdivisions) {
        return { measureIndex: index, columnInMeasure: column - start }
      }
    }
    if (measureOffsets.length === 0) {
      return null
    }
    const lastIndex = measureOffsets.length - 1
    return {
      measureIndex: lastIndex,
      columnInMeasure: measures[lastIndex].subdivisions - 1,
    }
  }

  const handlePointerMove = (
    event: ReactMouseEvent<SVGSVGElement>,
    rowStart: number,
    rowSubdivisions: number,
  ) => {
    const svg = event.currentTarget
    const rect = svg.getBoundingClientRect()
    const rowWidth = computeRowWidth(rowSubdivisions)
    const scaleX = rowWidth / rect.width
    const scaleY = staffHeight / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    const rawColumnLocal = (x - STAFF.paddingX) / COLUMN_STEP
    const rawColumnGlobal = rawColumnLocal + rowStart
    const column = Math.round(rawColumnGlobal)

    if (Number.isNaN(column)) {
      setHoverSlot(null)
      return
    }

    if (column < rowStart || column >= rowStart + rowSubdivisions) {
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

    const location = locateMeasure(column)
    if (!location) {
      setHoverSlot(null)
      return
    }

    setHoverSlot({
      measureIndex: location.measureIndex,
      column,
      columnInMeasure: location.columnInMeasure,
      rowId: closestRow.id,
      duration: selectedDuration,
      rowStart,
    })
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
  }

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    setZoom(Number(event.target.value))
  }

  const handleNoteDurationChange = (value: DurationOption['value']) => {
    setSelectedDuration(value)
    setHoverSlot((slot) => (slot ? { ...slot, duration: value } : slot))
  }

  const handleClick = () => {
    if (!hoverSlot) {
      return
    }

    setMeasures((current) =>
      current.map((measure, index) => {
        if (index !== hoverSlot.measureIndex) {
          return measure
        }

        const shiftedNotes = measure.notes.map((note) =>
          note.column >= hoverSlot.columnInMeasure
            ? { ...note, column: note.column + hoverSlot.duration }
            : note,
        )

        const conflict = shiftedNotes.some(
          (note) => note.column === hoverSlot.columnInMeasure && note.rowId === hoverSlot.rowId,
        )

        if (conflict) {
          return measure
        }

        const nextNotes = [
          ...shiftedNotes,
          {
            column: hoverSlot.columnInMeasure,
            rowId: hoverSlot.rowId,
            duration: hoverSlot.duration,
          } as MeasureNote,
        ]

        nextNotes.sort((a, b) => {
          if (a.column !== b.column) {
            return a.column - b.column
          }
          const orderA = rowOrder.get(a.rowId) ?? 0
          const orderB = rowOrder.get(b.rowId) ?? 0
          return orderA - orderB
        })

        return {
          subdivisions: measure.subdivisions + hoverSlot.duration,
          notes: nextNotes,
        }
      }),
    )

    setHoverSlot(null)
  }

  const handleClear = () => {
    if (currentMeasureNotes.length === 0) {
      return
    }
    setMeasures((current) =>
      current.map((measure, index) =>
        index === currentMeasure
          ? { subdivisions: DEFAULT_SUBDIVISIONS, notes: [] }
          : measure,
      ),
    )
    setHoverSlot(null)
  }

  const handlePrevMeasure = () => {
    setCurrentMeasure((index) => Math.max(0, index - 1))
    setHoverSlot(null)
  }

  const handleNextMeasure = () => {
    setCurrentMeasure((index) => Math.min(measures.length - 1, index + 1))
    setHoverSlot(null)
  }

  const handleAddMeasure = () => {
    setMeasures((current) => [...current, { subdivisions: DEFAULT_SUBDIVISIONS, notes: [] }])
    setCurrentMeasure(measures.length)
    setHoverSlot(null)
  }

  const handleCopyMeasure = () => {
    const measure = measures[currentMeasure]
    if (!measure) {
      return
    }
    setClipboard({
      subdivisions: measure.subdivisions,
      notes: measure.notes.map((note) => ({ ...note })),
    })
  }

  const handlePasteMeasure = () => {
    if (!clipboard) {
      return
    }
    setMeasures((current) =>
      current.map((measure, index) =>
        index === currentMeasure
          ? {
              subdivisions: clipboard.subdivisions,
              notes: clipboard.notes.map((note) => ({ ...note })),
            }
          : measure,
      ),
    )
    setHoverSlot(null)
  }

  const renderNote = (
    note: { column: number; rowId: NoteRowId; duration: number },
    rowStart: number,
    key: string,
    isPreview = false,
  ) => {
    const row = rowsById.get(note.rowId)
    if (!row) {
      return null
    }

    const x = xForColumnInRow(note.column, rowStart)
    const y = yForRow(row.row)
    const stemLength = noteStep * 3
    const groupClass = isPreview ? 'note preview' : 'note'
    const headClass = isPreview ? 'note-head preview' : 'note-head'
    const stemClass = isPreview ? 'note-stem preview' : 'note-stem'
    const crossClass = isPreview ? 'note-x preview' : 'note-x'
    const flagClass = isPreview ? 'note-flag preview' : 'note-flag'

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
          <line x1={x + 8} y1={y} x2={x + 8} y2={y - stemLength} className={stemClass} />
        ) : (
          <line x1={x - 8} y1={y} x2={x - 8} y2={y + stemLength} className={stemClass} />
        )}
        {note.duration > 1 && (
          <path
            className={flagClass}
            d={
              row.stem === 'up'
                ? `M ${x + 8} ${y - stemLength} L ${x + 8 + 18} ${y - stemLength + 6} L ${x + 8} ${y - stemLength + 12} Z`
                : `M ${x - 8} ${y + stemLength} L ${x - 8 - 18} ${y + stemLength - 6} L ${x - 8} ${y + stemLength - 12} Z`
            }
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
          Sketch grooves with percussion note heads that snap to the correct voices and subdivisions.
          Use the controls below to resize the staff, manage measures, copy ideas, and choose note
          lengths.
        </p>
        <div className="controls">
          <label className="zoom-control">
            <span>Staff size</span>
            <input
              type="range"
              min={1}
              max={1.8}
              step={0.05}
              value={zoom}
              onChange={handleZoomChange}
              aria-label="Adjust staff size"
            />
            <span className="zoom-control-value">{zoomLabel}</span>
          </label>
          <div className="duration-controls">
            <span className="duration-label">Note length</span>
            <div className="duration-buttons">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pill-button duration ${
                    selectedDuration === option.value ? 'active' : ''
                  }`}
                  onClick={() => handleNoteDurationChange(option.value)}
                >
                  <span aria-hidden>{option.symbol}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
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
              Measure {currentMeasure + 1} / {measures.length}
            </span>
            <button
              type="button"
              className="pill-button"
              onClick={handleNextMeasure}
              disabled={currentMeasure === measures.length - 1}
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
        <div className="staff-rows">
          {rows.map((row, rowIndex) => {
            const rowWidth = computeRowWidth(row.subdivisions)
            const rowScaledWidth = Math.round(rowWidth * zoom)
            const rowNotes = flattenedNotes.filter(
              (note) => note.column >= row.start && note.column < row.start + row.subdivisions,
            )
            const rowMarkers = beatMarkersByRow[rowIndex] ?? []

            return (
              <div key={row.rowIndex} className="staff-row">
                <svg
                  className="staff"
                  viewBox={`0 0 ${rowWidth} ${staffHeight}`}
                  onMouseMove={(event) => handlePointerMove(event, row.start, row.subdivisions)}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  style={{ width: `${rowScaledWidth}px`, maxWidth: '100%' }}
                >
                  <rect
                    x={32}
                    y={24}
                    width={rowWidth - 64}
                    height={staffHeight - 48}
                    className="staff-surface"
                    rx={16}
                  />

                  {Array.from({ length: row.subdivisions }, (_, index) => index + row.start).map(
                    (column) => {
                      if (column === row.start || column === row.start + row.subdivisions - 1) {
                        return null
                      }
                      const x = xForColumnInRow(column, row.start)
                      const isBeatMarker = rowMarkers.some(
                        (marker) => Math.abs(marker.position - column) < 0.001,
                      )
                      return (
                        <line
                          key={`col-${rowIndex}-${column}`}
                          x1={x}
                          y1={topLineY - noteStep * 2}
                          x2={x}
                          y2={staffHeight - STAFF.paddingY + noteStep * 2}
                          className={isBeatMarker ? 'grid-line beat' : 'grid-line subdivision'}
                        />
                      )
                    },
                  )}

                  {Array.from({ length: STAFF.lines }, (_, index) => topLineY + index * STAFF.lineSpacing).map(
                    (y, index) => (
                      <line
                        key={`line-${rowIndex}-${index}`}
                        x1={STAFF.paddingX - 24}
                        y1={y}
                        x2={rowWidth - STAFF.paddingX + 24}
                        y2={y}
                        className="staff-line"
                      />
                    ),
                  )}

                  {rowMarkers.map((marker, index) => (
                    <text
                      key={`beat-${rowIndex}-${index}`}
                      x={xForColumnInRow(marker.position, row.start)}
                      y={topLineY - noteStep * 2.7}
                      className="beat-label"
                    >
                      {marker.label}
                    </text>
                  ))}

                  {rowNotes.map((note, index) =>
                    renderNote(note, row.start, `note-${rowIndex}-${index}-${note.column}-${note.rowId}`),
                  )}

                  {hoverSlot &&
                    hoverSlot.rowStart === row.start &&
                    renderNote(
                      {
                        column: hoverSlot.column,
                        rowId: hoverSlot.rowId,
                        duration: hoverSlot.duration,
                      },
                      row.start,
                      'preview',
                      true,
                    )}
                </svg>
              </div>
            )
          })}
        </div>

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
