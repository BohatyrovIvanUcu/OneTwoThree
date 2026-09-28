import { useEffect, useState } from "react"
import { ChevronUp } from "lucide-react"

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-6 bottom-6 z-40 flex size-12 cursor-pointer items-center justify-center rounded-2xl border border-white/25 bg-slate-900/80 text-white shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-xl transition-all hover:border-indigo-400/50 hover:bg-indigo-600/80 hover:shadow-[0_8px_32px_rgba(99,102,241,0.5)] active:scale-95"
    >
      <ChevronUp className="size-5" />
    </button>
  )
}
