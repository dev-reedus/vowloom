import { useEffect, useId, useRef, useState } from 'react'

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function AdminTextInput({ className = '', ...props }) {
  return <input className={`admin-input ${className}`.trim()} {...props} />
}

// Custom listbox dropdown. Avoids the native <select> popup, which on mobile
// gets rendered by the OS detached from the trigger, and lets us match the
// app's pill/blush styling. Uses the aria-activedescendant listbox pattern:
// focus stays on the trigger button while arrow keys move the active option.
export function AdminSelect({
  value,
  onChange,
  options = [],
  placeholder = '',
  className = '',
  ...triggerProps
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const listId = useId()
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const idx = options.findIndex((opt) => opt.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit(index) {
    const opt = options[index]
    if (opt) onChange?.(opt.value)
    setOpen(false)
  }

  function onKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (open) setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        else setOpen(true)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (open) setActiveIndex((i) => Math.max(0, i - 1))
        else setOpen(true)
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) commit(activeIndex)
        else setOpen(true)
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          setOpen(false)
        }
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <div ref={rootRef} className={`admin-select-wrap ${className}`.trim()}>
      <button
        type="button"
        className={`admin-input admin-select-trigger ${open ? 'is-open' : ''}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-opt-${activeIndex}` : undefined}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
        {...triggerProps}
      >
        <span className={`admin-select-value ${selected ? '' : 'is-placeholder'}`.trim()}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="admin-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className="admin-select-menu" role="listbox" tabIndex={-1}>
          {options.map((opt, index) => (
            <li
              key={opt.value}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={opt.value === value}
              className={[
                'admin-select-option',
                index === activeIndex ? 'is-active' : '',
                opt.value === value ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminNumberInput({ className = '', ...props }) {
  return (
    <input
      className={`admin-input admin-number-input ${className}`.trim()}
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      {...props}
    />
  )
}

export function AdminDateTimeInput({ label, className = '', ...props }) {
  return (
    <label className={`admin-field admin-date-field ${className}`.trim()}>
      {label && <span className="admin-field-label">{label}</span>}
      <input className="admin-input admin-date-input" type="datetime-local" {...props} />
    </label>
  )
}

export function UploadDropzone({
  file,
  files,
  progress = 0,
  title,
  hint,
  selectedSummary,
  progressLabel,
  accept,
  multiple = false,
  onFile,
  onFiles,
}) {
  const fileInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const selectedFiles = files || (file ? [file] : [])

  function chooseFiles(nextFiles) {
    const list = Array.from(nextFiles || [])
    if (list.length === 0) return
    if (onFiles) onFiles(list)
    else if (onFile) onFile(list[0])
  }

  function onDrop(event) {
    event.preventDefault()
    setDragging(false)
    chooseFiles(event.dataTransfer.files)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          chooseFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className={`upload-dropzone ${dragging ? 'is-dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <strong>
          {selectedFiles.length === 1
            ? selectedFiles[0].name
            : selectedFiles.length > 1
              ? selectedSummary || `${selectedFiles.length} files selected`
              : title}
        </strong>
        <span>
          {selectedFiles.length === 1
            ? `${formatBytes(selectedFiles[0].size)}${selectedFiles[0].type ? ` · ${selectedFiles[0].type}` : ''}`
            : hint}
        </span>
        {progress > 0 && (
          <span className="upload-progress" aria-label={progressLabel}>
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>
    </>
  )
}
