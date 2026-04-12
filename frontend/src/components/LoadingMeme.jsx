import { useEffect, useState } from 'react'

// A small library of light-hearted loading messages with emojis. We rotate
// through them so the user always sees something fun while waiting on
// slow LLM/PDF/scrape operations.
const MEMES = [
  { e: '☕',  t: "Brewing coffee for the AI..." },
  { e: '🤖',  t: "Bribing the robots with cookies..." },
  { e: '🦄',  t: "Catching unicorns in the job market..." },
  { e: '🧠',  t: "Massaging neurons into formation..." },
  { e: '📜',  t: "Polishing your resume with rainbow wax..." },
  { e: '🚀',  t: "Launching your career to low Earth orbit..." },
  { e: '🐢',  t: "Speed-running your job hunt (slowly)..." },
  { e: '🪄',  t: "Casting Wingardium Leviosa on your match score..." },
  { e: '🎯',  t: "Calibrating recruiter laser sights..." },
  { e: '🥷',  t: "Sneaking past the ATS filters..." },
  { e: '🐙',  t: "An octopus is reading your PDF (don't ask)..." },
  { e: '🍿',  t: "Generating tailored buzzwords... grab popcorn." },
  { e: '🛠️',  t: "Tightening the bolts on your cover letter..." },
  { e: '📈',  t: "Convincing the matrix you're a 10x hire..." },
  { e: '🎩',  t: "Pulling skill gaps out of a top hat..." },
  { e: '🐕',  t: "Teaching the LLM to fetch keywords..." },
  { e: '🌮',  t: "Wrapping your experience in a tortilla of confidence..." },
  { e: '🪐',  t: "Aligning planets for maximum interview vibes..." },
  { e: '🧙',  t: "Whispering to the resume gnomes..." },
  { e: '🦾',  t: "Doing 1000 push-ups so you don't have to..." },
]

/**
 * LoadingMeme — animated, friendly loading state.
 *
 * Props:
 *   label?: string  — short caption shown above the meme (e.g. "Loading jobs")
 *   compact?: boolean — render in a single row, no card chrome
 */
export default function LoadingMeme({ label, compact = false }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * MEMES.length))

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % MEMES.length)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  const meme = MEMES[idx]

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 animate-bounce-in">
        <span className="animate-wiggle text-base">{meme.e}</span>
        <span className="font-medium">{meme.t}</span>
      </div>
    )
  }

  return (
    <div className="glass mx-auto max-w-md p-8 text-center space-y-4 animate-bounce-in">
      <div className="text-5xl animate-wiggle inline-block">{meme.e}</div>
      {label && (
        <p className="text-xs uppercase tracking-widest font-bold text-indigo-500">
          {label}
        </p>
      )}
      <p key={meme.t} className="text-sm font-semibold text-slate-700 animate-bounce-in">
        {meme.t}
      </p>
      <div className="meme-progress" />
      <p className="text-[11px] text-slate-400">
        Hang tight — local LLMs can be slow on the first run.
      </p>
    </div>
  )
}
