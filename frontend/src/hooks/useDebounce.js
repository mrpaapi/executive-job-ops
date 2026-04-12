import { useEffect, useState } from 'react'

/**
 * Debounce a value so rapid state changes (e.g. typing) don't fire expensive
 * effects until the user has stopped typing for `delay` ms.
 */
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
