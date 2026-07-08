import { useRef, useState } from 'react'

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function AdminTextInput({ className = '', ...props }) {
  return <input className={`admin-input ${className}`.trim()} {...props} />
}

export function AdminSelect({ className = '', children, ...props }) {
  return (
    <span className={`admin-select-wrap ${className}`.trim()}>
      <select className="admin-input admin-select" {...props}>
        {children}
      </select>
      <span className="admin-select-chevron" aria-hidden="true" />
    </span>
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
