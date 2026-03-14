import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-celestial-50 to-alabaster flex items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-4">
        <h1 className="text-5xl font-bold text-obsidian mb-4">
          Welcome to <span className="text-celestial-600">MyNorth</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Eliminate the paralysis between your goals and daily action. Morgan is your personal AI companion designed to break down your dreams into actionable daily tasks.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="btn-primary"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="btn-outline"
          >
            Sign In
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="card">
            <h3 className="text-lg font-semibold text-obsidian mb-2">Morgan AI</h3>
            <p className="text-gray-600">Your personal AI companion that understands your goals and motivates you daily.</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-obsidian mb-2">Constellation</h3>
            <p className="text-gray-600">Visualize your goals as an interconnected knowledge graph that grows with your progress.</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-obsidian mb-2">15 Minutes</h3>
            <p className="text-gray-600">The minimum viable daily action. Consistency compounds into mastery over time.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
