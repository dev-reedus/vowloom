import { useEffect, useMemo, useRef, useState } from 'react'
import { Arc, Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { motion } from 'framer-motion'
import {
  DoorOpen,
  Hand,
  Minus,
  MousePointer2,
  Pentagon,
  Plus,
  Redo2,
  Slash,
  Split,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import AppIcon from '../../components/AppIcon'
import { floorplanBackgroundUrl } from './FloorplanSvg'
import { cropFloorplanToContent, projectToSegment } from './floorplanGeometry'

const clone = (value) => structuredClone(value)
const uid = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
const flatPoints = (values = []) => values.flatMap(({ x, y }) => [x, y])
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

function useCanvasImage(url) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!url) {
      setImage(null)
      return undefined
    }
    const next = new window.Image()
    next.onload = () => setImage(next)
    next.src = url
    return () => {
      next.onload = null
    }
  }, [url])
  return image
}

function ToolButton({ active, children, ...props }) {
  return <button type="button" className={active ? 'is-active' : ''} {...props}>{children}</button>
}

export default function FloorplanEditor({
  floorplan,
  t,
  onSave,
  onClose,
  onUploadBackground,
  onRemoveBackground,
}) {
  const [draft, setDraft] = useState(() => clone(floorplan.data))
  const [tool, setTool] = useState(() => floorplan.data.boundary.length >= 3 ? 'select' : 'outline')
  const [selected, setSelected] = useState(null)
  const [wallStart, setWallStart] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [hasBackground, setHasBackground] = useState(floorplan.has_background)
  const [backgroundRevision, setBackgroundRevision] = useState(floorplan.background_revision)
  const [availableWidth, setAvailableWidth] = useState(720)
  const [zoom, setZoom] = useState(1)
  const [camera, setCamera] = useState(null)
  const workspaceRef = useRef(null)
  const panningRef = useRef(null)
  const pinchRef = useRef(null)
  const spacePressedRef = useRef(false)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    setDraft(clone(floorplan.data))
    setHasBackground(floorplan.has_background)
    setBackgroundRevision(floorplan.background_revision)
  }, [floorplan.revision])

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
        event.preventDefault()
        spacePressedRef.current = true
      }
    }
    const handleKeyUp = (event) => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [onClose])

  const canvas = draft.canvas
  const stageWidth = Math.max(260, availableWidth)
  const stageHeight = 530
  const baseScale = Math.max(1, Math.min((stageWidth - 48) / canvas.width, (stageHeight - 48) / canvas.height))
  const drawingScale = baseScale * zoom
  const fitCamera = {
    x: (stageWidth - canvas.width * baseScale) / 2,
    y: (stageHeight - canvas.height * baseScale) / 2,
  }
  const viewCamera = camera || fitCamera
  const backgroundUrl = hasBackground
    ? floorplanBackgroundUrl({ ...floorplan, has_background: true, background_revision: backgroundRevision })
    : null
  const backgroundImage = useCanvasImage(backgroundUrl)

  const gridLines = useMemo(() => {
    const lines = []
    const targetLines = 30
    const step = Math.max(0.25, Math.ceil((Math.max(canvas.width, canvas.height) / targetLines) * 4) / 4)
    const left = -viewCamera.x / drawingScale
    const top = -viewCamera.y / drawingScale
    const right = (stageWidth - viewCamera.x) / drawingScale
    const bottom = (stageHeight - viewCamera.y) / drawingScale
    const firstX = Math.floor(left / step) * step
    const firstY = Math.floor(top / step) * step
    for (let x = firstX; x <= right + step; x += step) {
      lines.push({ key: `x-${x}`, points: [x, top - step, x, bottom + step] })
    }
    for (let y = firstY; y <= bottom + step; y += step) {
      lines.push({ key: `y-${y}`, points: [left - step, y, right + step, y] })
    }
    return lines
  }, [canvas.width, canvas.height, drawingScale, stageHeight, stageWidth, viewCamera.x, viewCamera.y])

  function commit(change) {
    setUndoStack((stack) => [...stack.slice(-49), clone(draft)])
    setRedoStack([])
    setDraft((current) => typeof change === 'function' ? change(clone(current)) : clone(change))
    setSaveError('')
  }

  function undo() {
    const previous = undoStack.at(-1)
    if (!previous) return
    setRedoStack((stack) => [...stack, clone(draft)])
    setUndoStack((stack) => stack.slice(0, -1))
    setDraft(clone(previous))
    setSelected(null)
  }

  function redo() {
    const next = redoStack.at(-1)
    if (!next) return
    setUndoStack((stack) => [...stack, clone(draft)])
    setRedoStack((stack) => stack.slice(0, -1))
    setDraft(clone(next))
    setSelected(null)
  }

  function canvasPoint(event) {
    const point = event.target.getStage().getPointerPosition()
    return {
      x: Math.round(((point.x - viewCamera.x) / drawingScale) * 20) / 20,
      y: Math.round(((point.y - viewCamera.y) / drawingScale) * 20) / 20,
    }
  }

  function handleCanvasClick(event) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const stage = event.target.getStage()
    if (event.target !== stage && event.target.name() !== 'floor-fill') return
    const point = canvasPoint(event)
    if (tool === 'select') {
      setSelected(null)
      return
    }
    if (tool === 'outline') {
      commit((next) => {
        next.boundary.push(point)
        return next
      })
      setSelected({ kind: 'boundary', index: draft.boundary.length })
      return
    }
    if (tool === 'split') {
      splitBoundaryAt(point)
      return
    }
    if (tool === 'wall') {
      if (!wallStart) {
        setWallStart(point)
      } else {
        const wallId = uid('wall')
        commit((next) => {
          const wall = {
            id: wallId,
            start: wallStart,
            end: point,
          }
          next.walls.push(wall)
          return next
        })
        setSelected({ kind: 'wall', id: wallId })
        setWallStart(null)
        setTool('select')
      }
      return
    }
    if (tool === 'door') {
      const door = { id: uid('door'), ...point, width: Math.min(1.2, canvas.width / 4), rotation: 0 }
      commit((next) => {
        next.doors.push(door)
        return next
      })
      setSelected({ kind: 'door', id: door.id })
      setTool('select')
      return
    }
    if (tool === 'label') {
      const label = { id: uid('label'), text: t.floorplanNewLabel, ...point }
      commit((next) => {
        next.labels.push(label)
        return next
      })
      setSelected({ kind: 'label', id: label.id })
      setTool('select')
    }
  }

  function splitBoundaryAt(point) {
    if (draft.boundary.length < 2) return
    let nearest = null
    draft.boundary.forEach((start, index) => {
      const end = draft.boundary[(index + 1) % draft.boundary.length]
      const projected = projectToSegment(point, start, end)
      if (!nearest || projected.distance < nearest.distance) nearest = { ...projected, index }
    })
    if (!nearest || nearest.distance > 16 / drawingScale) return
    commit((next) => {
      next.boundary.splice(nearest.index + 1, 0, nearest.point)
      return next
    })
    setSelected({ kind: 'boundary', index: nearest.index + 1 })
    setTool('select')
  }

  function splitWallAt(wallId, point) {
    const wall = draft.walls.find((item) => item.id === wallId)
    if (!wall) return
    const splitPoint = projectToSegment(point, wall.start, wall.end).point
    if (Math.hypot(splitPoint.x - wall.start.x, splitPoint.y - wall.start.y) < 0.05) return
    if (Math.hypot(splitPoint.x - wall.end.x, splitPoint.y - wall.end.y) < 0.05) return
    const secondId = uid('wall')
    commit((next) => {
      const current = next.walls.find((item) => item.id === wallId)
      const oldEnd = current.end
      current.end = splitPoint
      next.walls.push({ id: secondId, start: splitPoint, end: oldEnd })
      return next
    })
    setSelected({ kind: 'wall', id: secondId })
    setTool('select')
  }

  function changeZoom(rawZoom, anchor = { x: stageWidth / 2, y: stageHeight / 2 }) {
    const nextZoom = clamp(rawZoom, MIN_ZOOM, MAX_ZOOM)
    const ratio = nextZoom / zoom
    setCamera({
      x: anchor.x - (anchor.x - viewCamera.x) * ratio,
      y: anchor.y - (anchor.y - viewCamera.y) * ratio,
    })
    setZoom(nextZoom)
  }

  function fitView() {
    setZoom(1)
    setCamera(null)
  }

  function handleWheel(event) {
    event.evt.preventDefault()
    const pointer = event.target.getStage().getPointerPosition()
    changeZoom(zoom * (event.evt.deltaY > 0 ? 0.88 : 1.12), pointer)
  }

  function localTouch(touch, stage) {
    const rect = stage.container().getBoundingClientRect()
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }

  function touchDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y)
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function handleStagePointerDown(event) {
    const stage = event.target.getStage()
    const touches = event.evt.touches
    if (touches?.length === 2) {
      event.evt.preventDefault()
      const a = localTouch(touches[0], stage)
      const b = localTouch(touches[1], stage)
      const center = midpoint(a, b)
      pinchRef.current = {
        distance: touchDistance(a, b),
        zoom,
        world: {
          x: (center.x - viewCamera.x) / drawingScale,
          y: (center.y - viewCamera.y) / drawingScale,
        },
      }
      panningRef.current = null
      return
    }
    const shouldPan = tool === 'pan' || event.evt.button === 1 || spacePressedRef.current
    if (!shouldPan) return
    event.evt.preventDefault()
    panningRef.current = { pointer: stage.getPointerPosition(), camera: { ...viewCamera } }
  }

  function handleStagePointerMove(event) {
    const stage = event.target.getStage()
    const touches = event.evt.touches
    if (touches?.length === 2 && pinchRef.current) {
      event.evt.preventDefault()
      const a = localTouch(touches[0], stage)
      const b = localTouch(touches[1], stage)
      const center = midpoint(a, b)
      const nextZoom = clamp(
        pinchRef.current.zoom * (touchDistance(a, b) / pinchRef.current.distance),
        MIN_ZOOM,
        MAX_ZOOM,
      )
      setZoom(nextZoom)
      setCamera({
        x: center.x - pinchRef.current.world.x * baseScale * nextZoom,
        y: center.y - pinchRef.current.world.y * baseScale * nextZoom,
      })
      suppressClickRef.current = true
      return
    }
    if (!panningRef.current) return
    event.evt.preventDefault()
    const pointer = stage.getPointerPosition()
    const dx = pointer.x - panningRef.current.pointer.x
    const dy = pointer.y - panningRef.current.pointer.y
    if (Math.abs(dx) + Math.abs(dy) > 2) suppressClickRef.current = true
    setCamera({ x: panningRef.current.camera.x + dx, y: panningRef.current.camera.y + dy })
  }

  function handleStagePointerUp(event) {
    if (!event.evt.touches || event.evt.touches.length < 2) pinchRef.current = null
    panningRef.current = null
  }

  function moveBoundary(index, event) {
    const point = { x: event.target.x(), y: event.target.y() }
    commit((next) => {
      next.boundary[index] = point
      return next
    })
  }

  function moveWallPoint(id, endpoint, event) {
    const point = { x: event.target.x(), y: event.target.y() }
    commit((next) => {
      const wall = next.walls.find((item) => item.id === id)
      wall[endpoint] = point
      return next
    })
  }

  function moveItem(collection, id, event) {
    commit((next) => {
      const item = next[collection].find((value) => value.id === id)
      item.x = event.target.x()
      item.y = event.target.y()
      return next
    })
  }

  function deleteSelected() {
    if (!selected) return
    if (selected.kind === 'boundary') {
      if (draft.boundary.length <= 3) return
      commit((next) => {
        next.boundary.splice(selected.index, 1)
        return next
      })
    } else {
      const collection = `${selected.kind}s`
      commit((next) => ({ ...next, [collection]: next[collection].filter((item) => item.id !== selected.id) }))
    }
    setSelected(null)
  }

  function updateSelected(field, value) {
    if (!selected || selected.kind === 'boundary') return
    const collection = `${selected.kind}s`
    commit((next) => {
      const item = next[collection].find((entry) => entry.id === selected.id)
      item[field] = value
      return next
    })
  }

  function redrawOutline() {
    if (!window.confirm(t.floorplanRedrawConfirm)) return
    commit((next) => ({ ...next, boundary: [] }))
    setSelected(null)
    setTool('outline')
  }

  function resizeCanvas(key, rawValue) {
    const value = clamp(Number(rawValue) || 1, 1, 1000)
    const oldValue = canvas[key]
    const ratio = value / oldValue
    commit((next) => {
      next.canvas[key] = value
      const coordinate = key === 'width' ? 'x' : 'y'
      next.boundary.forEach((point) => { point[coordinate] *= ratio })
      next.walls.forEach((wall) => {
        wall.start[coordinate] *= ratio
        wall.end[coordinate] *= ratio
      })
      next.doors.forEach((door) => { door[coordinate] *= ratio })
      next.labels.forEach((label) => { label[coordinate] *= ratio })
      if (key === 'width') next.doors.forEach((door) => { door.width *= ratio })
      return next
    })
    fitView()
  }

  async function save() {
    if (draft.boundary.length < 3) {
      setSaveError(t.floorplanOutlineRequired)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onSave(cropFloorplanToContent(clone(draft)))
      onClose()
    } catch (error) {
      console.error('Failed to save floorplan', error)
      setSaveError(t.floorplanSaveError)
    } finally {
      setSaving(false)
    }
  }

  async function uploadBackground(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setSaveError('')
    try {
      const saved = await onUploadBackground(file)
      setHasBackground(true)
      setBackgroundRevision(saved.background_revision || Date.now())
    } catch (error) {
      console.error('Failed to upload floorplan background', error)
      setSaveError(t.floorplanBackgroundError)
    } finally {
      setUploading(false)
    }
  }

  async function removeBackground() {
    try {
      await onRemoveBackground()
      setHasBackground(false)
      setBackgroundRevision(null)
    } catch (error) {
      console.error('Failed to remove floorplan background', error)
      setSaveError(t.floorplanBackgroundError)
    }
  }

  const selectedItem = selected && selected.kind !== 'boundary'
    ? draft[`${selected.kind}s`]?.find((item) => item.id === selected.id)
    : null
  const lineWidth = 2 / drawingScale
  const handleRadius = 6 / drawingScale

  return (
    <motion.div className="floorplan-editor-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className="floorplan-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floorplan-editor-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
      >
        <header className="floorplan-editor-head">
          <div>
            <span>{t.floorplanKicker}</span>
            <h3 id="floorplan-editor-title">{t.floorplanTitle}</h3>
          </div>
          <button type="button" className="floorplan-close" onClick={onClose} aria-label={t.floorplanClose}>
            <AppIcon icon={X} size={16} strokeWidth={2.1} />
          </button>
        </header>

        <div className="floorplan-toolbar" aria-label={t.floorplanTools}>
          <ToolButton active={tool === 'select'} onClick={() => { setTool('select'); setWallStart(null) }}><AppIcon icon={MousePointer2} />{t.floorplanSelect}</ToolButton>
          <ToolButton active={tool === 'outline'} onClick={() => { setTool('outline'); setWallStart(null) }}><AppIcon icon={Pentagon} />{t.floorplanOutline}</ToolButton>
          <ToolButton active={tool === 'wall'} onClick={() => { setTool('wall'); setWallStart(null) }}><AppIcon icon={Slash} />{t.floorplanWall}</ToolButton>
          <ToolButton active={tool === 'door'} onClick={() => { setTool('door'); setWallStart(null) }}><AppIcon icon={DoorOpen} />{t.floorplanDoor}</ToolButton>
          <ToolButton active={tool === 'label'} onClick={() => { setTool('label'); setWallStart(null) }}><AppIcon icon={Type} />{t.floorplanLabel}</ToolButton>
          <ToolButton active={tool === 'split'} onClick={() => { setTool('split'); setWallStart(null) }}><AppIcon icon={Split} />{t.floorplanSplit}</ToolButton>
          <ToolButton active={tool === 'pan'} onClick={() => { setTool('pan'); setWallStart(null) }}><AppIcon icon={Hand} />{t.floorplanPan}</ToolButton>
          <span className="floorplan-toolbar-sep" />
          <button type="button" onClick={undo} disabled={!undoStack.length} aria-label={t.floorplanUndo}><AppIcon icon={Undo2} /></button>
          <button type="button" onClick={redo} disabled={!redoStack.length} aria-label={t.floorplanRedo}><AppIcon icon={Redo2} /></button>
          <button type="button" onClick={deleteSelected} disabled={!selected || (selected.kind === 'boundary' && draft.boundary.length <= 3)} aria-label={t.floorplanDelete}><AppIcon icon={Trash2} /></button>
          <span className="floorplan-toolbar-spacer" />
          <div className="floorplan-zoom-controls" aria-label={t.floorplanZoom}>
            <button type="button" onClick={() => changeZoom(zoom / 1.25)} aria-label={t.floorplanZoomOut}><AppIcon icon={Minus} /></button>
            <button type="button" className="floorplan-zoom-value" onClick={fitView} title={t.floorplanZoomFit}>{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => changeZoom(zoom * 1.25)} aria-label={t.floorplanZoomIn}><AppIcon icon={Plus} /></button>
          </div>
        </div>

        <div className="floorplan-editor-body">
          <div className="floorplan-workspace" ref={workspaceRef}>
            <div className={`floorplan-canvas-shell ${tool === 'pan' ? 'is-pan' : ''}`} style={{ width: stageWidth, height: stageHeight }}>
              <Stage
                width={stageWidth}
                height={stageHeight}
                onClick={handleCanvasClick}
                onTap={handleCanvasClick}
                onWheel={handleWheel}
                onMouseDown={handleStagePointerDown}
                onMouseMove={handleStagePointerMove}
                onMouseUp={handleStagePointerUp}
                onMouseLeave={handleStagePointerUp}
                onTouchStart={handleStagePointerDown}
                onTouchMove={handleStagePointerMove}
                onTouchEnd={handleStagePointerUp}
              >
                <Layer x={viewCamera.x} y={viewCamera.y} scaleX={drawingScale} scaleY={drawingScale}>
                  {gridLines.map((line) => <Line key={line.key} points={line.points} stroke="rgba(134,111,81,.13)" strokeWidth={1 / drawingScale} listening={false} />)}
                  {backgroundImage && (
                    <KonvaImage
                      image={backgroundImage}
                      width={canvas.width}
                      height={canvas.height}
                      opacity={draft.background?.opacity ?? 0.35}
                      listening={false}
                    />
                  )}
                  {draft.boundary.length >= 2 && (
                    <Line
                      name="floor-fill"
                      points={flatPoints(draft.boundary)}
                      closed={draft.boundary.length >= 3}
                      fill="rgba(255,255,255,.42)"
                      stroke="#766856"
                      strokeWidth={lineWidth}
                      lineJoin="round"
                    />
                  )}
                  {draft.walls.map((wall) => (
                    <Group key={wall.id}>
                      <Line
                        points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                        stroke={selected?.id === wall.id ? '#b66f79' : '#766856'}
                        strokeWidth={lineWidth * 1.2}
                        hitStrokeWidth={12 / drawingScale}
                        onClick={(event) => {
                          event.cancelBubble = true
                          if (tool === 'split') splitWallAt(wall.id, canvasPoint(event))
                          else setSelected({ kind: 'wall', id: wall.id })
                        }}
                        onTap={(event) => {
                          event.cancelBubble = true
                          if (tool === 'split') splitWallAt(wall.id, canvasPoint(event))
                          else setSelected({ kind: 'wall', id: wall.id })
                        }}
                      />
                      {tool === 'select' && selected?.id === wall.id && ['start', 'end'].map((endpoint) => (
                        <Circle
                          key={endpoint}
                          x={wall[endpoint].x}
                          y={wall[endpoint].y}
                          radius={handleRadius}
                          fill="#fffaf4"
                          stroke="#b66f79"
                          strokeWidth={lineWidth}
                          draggable
                          onDragEnd={(event) => moveWallPoint(wall.id, endpoint, event)}
                        />
                      ))}
                    </Group>
                  ))}
                  {wallStart && <Circle x={wallStart.x} y={wallStart.y} radius={handleRadius} fill="#b66f79" listening={false} />}
                  {draft.doors.map((door) => (
                    <Group
                      key={door.id}
                      x={door.x}
                      y={door.y}
                      rotation={door.rotation}
                      draggable={tool === 'select'}
                      onDragEnd={(event) => moveItem('doors', door.id, event)}
                      onClick={(event) => { event.cancelBubble = true; setSelected({ kind: 'door', id: door.id }) }}
                      onTap={(event) => { event.cancelBubble = true; setSelected({ kind: 'door', id: door.id }) }}
                    >
                      <Rect x={-door.width / 2} y={-lineWidth * 2} width={door.width} height={lineWidth * 4} fill="#f8f3ea" />
                      <Line points={[-door.width / 2, 0, -door.width / 2, -door.width]} stroke="#b66f79" strokeWidth={lineWidth} />
                      <Arc innerRadius={door.width} outerRadius={door.width} angle={90} rotation={180} stroke="#b66f79" strokeWidth={lineWidth} />
                      {selected?.id === door.id && <Circle radius={handleRadius * 0.7} fill="#b66f79" />}
                    </Group>
                  ))}
                  {draft.labels.map((label) => (
                    <Text
                      key={label.id}
                      x={label.x}
                      y={label.y}
                      text={label.text.toUpperCase()}
                      fontSize={11 / drawingScale}
                      letterSpacing={1.4 / drawingScale}
                      fill={selected?.id === label.id ? '#a65161' : '#6f6559'}
                      draggable={tool === 'select'}
                      onDragEnd={(event) => moveItem('labels', label.id, event)}
                      onClick={(event) => { event.cancelBubble = true; setSelected({ kind: 'label', id: label.id }) }}
                      onTap={(event) => { event.cancelBubble = true; setSelected({ kind: 'label', id: label.id }) }}
                    />
                  ))}
                  {(tool === 'select' || tool === 'outline') && draft.boundary.map((point, index) => (
                    <Circle
                      key={`${index}-${point.x}-${point.y}`}
                      x={point.x}
                      y={point.y}
                      radius={handleRadius}
                      fill={selected?.kind === 'boundary' && selected.index === index ? '#b66f79' : '#fffaf4'}
                      stroke="#9d6570"
                      strokeWidth={lineWidth}
                      draggable
                      onClick={(event) => { event.cancelBubble = true; setSelected({ kind: 'boundary', index }) }}
                      onTap={(event) => { event.cancelBubble = true; setSelected({ kind: 'boundary', index }) }}
                      onDragEnd={(event) => moveBoundary(index, event)}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
            <p className="floorplan-canvas-hint">
              {tool === 'wall' && wallStart ? t.floorplanWallEndHint : t[`floorplan${tool[0].toUpperCase()}${tool.slice(1)}Hint`]}
            </p>
          </div>

          <aside className="floorplan-inspector">
            <section>
              <h4>{t.floorplanDimensions}</h4>
              <div className="floorplan-dimensions">
                <label>{t.floorplanWidth}<input type="number" min="1" max="1000" step="0.1" value={canvas.width} onChange={(event) => resizeCanvas('width', event.target.value)} /></label>
                <span>×</span>
                <label>{t.floorplanHeight}<input type="number" min="1" max="1000" step="0.1" value={canvas.height} onChange={(event) => resizeCanvas('height', event.target.value)} /></label>
                <select value={canvas.unit} onChange={(event) => commit((next) => { next.canvas.unit = event.target.value; return next })} aria-label={t.floorplanUnit}>
                  <option value="m">m</option><option value="ft">ft</option><option value="custom">—</option>
                </select>
              </div>
              <button type="button" className="floorplan-text-button" onClick={redrawOutline}>{t.floorplanRedraw}</button>
            </section>

            <section>
              <h4>{t.floorplanBackground}</h4>
              <label className="floorplan-upload">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadBackground} disabled={uploading} />
                {uploading ? t.floorplanUploading : hasBackground ? t.floorplanReplaceBackground : t.floorplanAddBackground}
              </label>
              {hasBackground && (
                <>
                  <label className="floorplan-opacity">{t.floorplanOpacity}<input type="range" min="0" max="1" step="0.05" value={draft.background?.opacity ?? 0.35} onChange={(event) => commit((next) => { next.background.opacity = Number(event.target.value); return next })} /></label>
                  <button type="button" className="floorplan-text-button danger" onClick={removeBackground}>{t.floorplanRemoveBackground}</button>
                </>
              )}
            </section>

            <section className={!selected ? 'is-muted' : ''}>
              <h4>{t.floorplanSelection}</h4>
              {!selected && <p>{t.floorplanNothingSelected}</p>}
              {selected?.kind === 'boundary' && <p>{t.floorplanVertexSelected(selected.index + 1)}</p>}
              {selected?.kind === 'wall' && <p>{t.floorplanWallSelected}</p>}
              {selected?.kind === 'label' && (
                <label>{t.floorplanLabelText}<input type="text" maxLength="100" value={selectedItem?.text || ''} onChange={(event) => updateSelected('text', event.target.value)} /></label>
              )}
              {selected?.kind === 'door' && selectedItem && (
                <>
                  <label>{t.floorplanDoorWidth}<input type="number" min="0.2" step="0.1" value={selectedItem.width} onChange={(event) => updateSelected('width', Math.max(0.2, Number(event.target.value) || 0.2))} /></label>
                  <label>{t.floorplanRotation}<input type="number" min="-360" max="360" step="5" value={selectedItem.rotation} onChange={(event) => updateSelected('rotation', Number(event.target.value) || 0)} /></label>
                </>
              )}
            </section>
          </aside>
        </div>

        <footer className="floorplan-editor-foot">
          <div>{saveError && <p role="alert">{saveError}</p>}</div>
          <button type="button" className="floorplan-cancel" onClick={onClose}>{t.floorplanCancel}</button>
          <button type="button" className="floorplan-save" onClick={save} disabled={saving}>{saving ? t.floorplanSaving : t.floorplanSave}</button>
        </footer>
      </motion.section>
    </motion.div>
  )
}
