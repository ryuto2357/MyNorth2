'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setMousePosition({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        })
      }
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-gradient-to-br from-celestial-50 via-white to-alabaster" />
        {/* Gradient orbs for background depth */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-celestial-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-celestial-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2" />
        <div className="absolute -bottom-8 left-1/2 w-96 h-96 bg-celestial-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4" />
      </div>

      {/* Parallax Background Elements */}
      <div
        ref={containerRef}
        className="fixed inset-0 -z-10 pointer-events-none"
      >
        {/* Mountains parallax */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translateY(${(mousePosition.y - 0.5) * 40}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <Image
            src="/images/mountain-background.png"
            alt="Mountains"
            fill
            className="object-cover opacity-10"
            priority
          />
        </div>

        {/* Clouds parallax */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${(mousePosition.x - 0.5) * 30}px, ${(mousePosition.y - 0.5) * 20}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <Image
            src="/images/cloud.png"
            alt="Clouds"
            fill
            className="object-cover opacity-5"
            priority
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        {/* Logo with hover effect */}
        <div className="mb-8 animate-fade-in-down">
          <div className="relative w-32 h-32 hover-lift">
            <Image
              src="/images/logo.jpg"
              alt="MyNorth Logo"
              fill
              className="object-contain rounded-2xl shadow-lg hover:shadow-2xl transition-shadow duration-300"
              priority
            />
          </div>
        </div>

        {/* Main Content Container */}
        <div className="max-w-3xl mx-auto text-center space-y-8 animate-fade-in-up">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-bold text-obsidian leading-tight">
              Your Path to <span className="bg-gradient-to-r from-celestial-600 to-celestial-400 bg-clip-text text-transparent">MyNorth</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 font-light leading-relaxed max-w-2xl mx-auto">
              Eliminate the paralysis between your goals and daily action. Morgan is your personal AI companion designed to break down your dreams into <span className="font-semibold text-celestial-600">actionable daily tasks</span>.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 animate-fade-in">
            <Link
              href="/auth/signup"
              className="btn-primary text-lg px-8 py-3 hover:scale-105 transform transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Start Your Journey
            </Link>
            <Link
              href="/auth/login"
              className="btn-outline text-lg px-8 py-3 hover:scale-105 transform transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Morgan Mascot - Right side with parallax */}
        <div className="absolute right-0 bottom-20 hidden lg:block opacity-20 pointer-events-none"
          style={{
            transform: `translate(${(mousePosition.x - 0.5) * 60}px, ${(mousePosition.y - 0.5) * 40}px) scale(0.8)`,
            transition: 'transform 0.3s ease-out',
          }}>
          <Image
            src="/images/morgan-mascot.png"
            alt="Morgan Mascot"
            width={300}
            height={300}
            className="drop-shadow-lg"
          />
        </div>
      </div>

      {/* Features Section with staggered animation */}
      <section className="relative z-10 py-24 px-4 bg-gradient-to-b from-transparent to-white/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-obsidian mb-16">
            Why Choose <span className="text-celestial-600">MyNorth</span>?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group card hover:shadow-lg transition-all duration-300 hover:scale-105 hover:-translate-y-2 animate-fade-in-up animation-delay-1">
              <div className="w-14 h-14 bg-gradient-to-br from-celestial-500 to-celestial-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.5 1.5H5.75A4.25 4.25 0 001.5 5.75v8.5A4.25 4.25 0 005.75 18.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0014.25 1.5h-3.75m0 0V.75m0 .75v3m6.5-3v3" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600 transition-colors">Morgan AI</h3>
              <p className="text-gray-600">Your personal AI companion that understands your goals and motivates you daily with intelligent insights.</p>
            </div>

            {/* Feature 2 */}
            <div className="group card hover:shadow-lg transition-all duration-300 hover:scale-105 hover:-translate-y-2 animate-fade-in-up animation-delay-2">
              <div className="w-14 h-14 bg-gradient-to-br from-celestial-500 to-celestial-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.5 5.5h15m-15 3h15m-15 3h15m-15 3h15M2.5 1.5A1 1 0 013.5.5h13a1 1 0 011 1v17a1 1 0 01-1 1h-13a1 1 0 01-1-1v-17z" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600 transition-colors">Constellation</h3>
              <p className="text-gray-600">Visualize your goals as an interconnected knowledge graph that grows with your progress and achievements.</p>
            </div>

            {/* Feature 3 */}
            <div className="group card hover:shadow-lg transition-all duration-300 hover:scale-105 hover:-translate-y-2 animate-fade-in-up animation-delay-3">
              <div className="w-14 h-14 bg-gradient-to-br from-celestial-500 to-celestial-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 1a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm0 1a1 1 0 011 1v4.586l3.293-3.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 111.414-1.414L9 10.586V5a1 1 0 011-1z" stroke="white" strokeWidth="0.5"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600 transition-colors">15 Minutes Daily</h3>
              <p className="text-gray-600">The minimum viable daily action. Consistency compounds into mastery over time through dedicated effort.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Action Button (optional) */}
      <div className="fixed bottom-8 right-8 z-40">
        <Link
          href="/auth/signup"
          className="w-16 h-16 bg-gradient-to-br from-celestial-600 to-celestial-700 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 hover:from-celestial-700 hover:to-celestial-800"
          title="Get Started"
        >
          →
        </Link>
      </div>
    </div>
  )
}
