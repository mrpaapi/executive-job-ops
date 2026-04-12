import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

const ActiveProfileContext = createContext(null)

function normalizeProfileId(profileId, profiles) {
  if (!profileId) return ''
  const normalized = String(profileId)
  return profiles.some((profile) => String(profile.id) === normalized) ? normalized : ''
}

export function ActiveProfileProvider({ children, profiles }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeProfileId, setActiveProfileIdState] = useState('')

  useEffect(() => {
    if (profiles.length === 0) {
      setActiveProfileIdState('')
      return
    }

    const routeProfileId = normalizeProfileId(searchParams.get('profileId'), profiles)

    if (routeProfileId) {
      setActiveProfileIdState(routeProfileId)
      return
    }

    setActiveProfileIdState((current) => {
      const validCurrent = normalizeProfileId(current, profiles)
      return validCurrent || String(profiles[0].id)
    })
  }, [profiles, searchParams])

  function setActiveProfileId(profileId, options = {}) {
    const normalized = normalizeProfileId(profileId, profiles)
    const nextPath = options.pathname || location.pathname
    const nextParams = new URLSearchParams(options.preserveSearch ? location.search : '')

    if (normalized) nextParams.set('profileId', normalized)
    else nextParams.delete('profileId')

    setActiveProfileIdState(normalized)
    navigate(
      {
        pathname: nextPath,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      { replace: options.replace }
    )
  }

  const activeProfile =
    profiles.find((profile) => String(profile.id) === String(activeProfileId)) || null

  return (
    <ActiveProfileContext.Provider
      value={{ activeProfileId, activeProfile, setActiveProfileId }}
    >
      {children}
    </ActiveProfileContext.Provider>
  )
}

export function useActiveProfile() {
  const context = useContext(ActiveProfileContext)

  if (!context) {
    throw new Error('useActiveProfile must be used within ActiveProfileProvider')
  }

  return context
}
