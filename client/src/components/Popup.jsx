import { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function Popup() {
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const summarize = async () => {
    if (!text.trim()) {
      setError('Please enter or select some text')
      return
    }
    setLoading(true)
    setError('')
    setResult('')
    try {
      const res = await fetch(`${API_BASE}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResult(data.summary || '')
    } catch (e) {
      setError('Failed to summarize')
    } finally {
      setLoading(false)
    }
  }

  const analyzeImage = async () => {
    if (!image) {
      setError('No image captured')
      return
    }
    setLoading(true)
    setError('')
    setResult('')
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResult(data.description || '')
    } catch (e) {
      setError('Failed to analyze image')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // If running inside extension popup, try to pull selection/screenshot via chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['solexity_selectedText', 'solexity_capturedImage'], (data) => {
        if (data.solexity_selectedText) setText(data.solexity_selectedText)
        if (data.solexity_capturedImage) setImage(data.solexity_capturedImage)
      })
    }
  }, [])

  return (
    <div className="w-[320px] min-h-[200px] p-4 bg-white text-gray-900">
      <div className="mb-3">
        <h2 className="text-base font-semibold">Solexity</h2>
        <p className="text-xs text-gray-500">Summarize text or analyze a screenshot</p>
      </div>

      <textarea
        className="w-full h-28 resize-none rounded-md border border-gray-200 bg-gray-50 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
        placeholder="Selected text will appear here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-2 flex gap-2">
        <button
          onClick={summarize}
          disabled={loading}
          className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Working…' : 'Summarize'}
        </button>
        <button
          onClick={analyzeImage}
          disabled={loading}
          className="flex-1 rounded-md border border-gray-900 px-3 py-2 text-sm font-medium text-gray-900 disabled:opacity-60"
        >
          {loading ? 'Working…' : 'Analyze Image'}
        </button>
      </div>

      {image && (
        <img src={image} alt="Captured" className="mt-3 max-h-40 w-full rounded-md border border-gray-200 object-contain" />
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm whitespace-pre-wrap">{result}</div>
      )}
    </div>
  )
}


