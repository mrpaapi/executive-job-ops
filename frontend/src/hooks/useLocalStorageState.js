import { useEffect, useRef, useState } from 'react'

/**
 * useState that quietly persists to localStorage. Lets the Discovery filters,
 * Coach mode, and other "I picked this last week" toggles survive a refresh
 * without dragging in a state library.
 *
 * Reads are lazy so we only hit localStorage on the first render. Writes are
 * fire-and-forget; if storage is full or blocked we silently give up rather
 * than crashing the page.
 */
export default function useLocalStorageState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return typeof initial === 'function' ? initial() : initial
      return JSON.parse(raw)
    } catch {
      return typeof initial === 'function' ? initial() : initial
    }
  })

  // Avoid re-writing on the first render — useEffect already runs after mount.
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])

  return [value, setValue]
}
