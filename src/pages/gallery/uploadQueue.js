// PUT a file straight to a presigned R2 URL, reporting 0–100 upload progress.
export function putFileWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`PUT R2 -> ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('PUT R2 failed'))
    xhr.send(file)
  })
}

export function createQueueItem(file) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: 'queued',
    progress: 0,
    error: '',
  }
}

// A single 0–100 figure spanning the whole prepare → upload → derivatives flow,
// so the aggregate bar advances smoothly rather than jumping per stage.
export function itemOverallProgress(item) {
  if (item.status === 'done' || item.status === 'error') return 100
  if (item.status === 'processing') return 85
  if (item.status === 'uploading') return Math.round(10 + (item.progress || 0) * 0.7)
  if (item.status === 'preparing') return 5
  return 0
}
