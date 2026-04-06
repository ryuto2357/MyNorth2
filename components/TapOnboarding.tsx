'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// --- Types & Interfaces ---

type Category = 'university' | 'grades' | 'exam' | 'skill' | 'direction' | 'custom'
type MotivationType = 'intrinsic' | 'extrinsic_family' | 'extrinsic_peer' | 'unclear'
type DeadlineHorizon = 'urgent' | 'near' | 'medium' | 'long'
type PrimaryBlocker = 'directionless' | 'distraction' | 'motivation_decay' | 'time_scarcity' | 'system_failure'
type Grade = 'grade_10' | 'grade_11' | 'grade_12' | 'college_1' | 'other'
type TimeSlot = 'morning' | 'afternoon' | 'night' | 'weekend' | 'scarce'
type Role = 'STUDENT' | 'COUNSELOR' | 'PARENT'

interface OnboardingState {
  category: Category
  category_text?: string
  motivation_type: MotivationType
  deadline_horizon: DeadlineHorizon
  familiarity_baseline: number
  completion_rate_history: number
  free_time_slots: TimeSlot[]
  time_scarce: boolean
  primary_blocker: PrimaryBlocker
  name: string
  goal_title: string
  grade: Grade
}

interface AuthStepState {
  selectedRole: Role
  email: string
  password: string
  confirmPassword: string
  isUnder18: boolean
  consentAgreed: boolean
}

const STORAGE_KEY = 'mynorth_onboarding_draft'

// ---------------------------------------------------------------------------
// Step flow constants — update here if the step count or flow changes.
// ---------------------------------------------------------------------------

const FADE_TRANSITION_STEPS = new Set([4, 7, 10, 11, 14])
const LOADING_STEP = 11
const PROGRESS_BAR_STEPS = [1, 2, 3, 4, 5, 6, 7, 15, 16, 17]
const TOTAL_STEPS = 18

// --- Research-Backed Reactive Data ---

const BLOCKER_STATS: Record<PrimaryBlocker, {
  headline: string
  sub: string
  body: string
  source: string
}> = {
  directionless: {
    headline: '80%',
    sub: 'of students aged 12–26',
    body: "don't have a clear, actionable sense of purpose. You said you don't know where to start — that's not a personal failing, it's the statistical norm.",
    source: 'William Damon, Stanford Center on Adolescence (n=1,200)',
  },
  distraction: {
    headline: '47s',
    sub: 'average digital focus',
    body: "is how long people last on a single screen before switching tasks. You said distraction is your biggest barrier — your brain isn't broken, it's been conditioned by your phone.",
    source: 'Dr. Gloria Mark, UC Irvine (2004–2023)',
  },
  motivation_decay: {
    headline: '81%',
    sub: 'of teenagers',
    body: "report failing at an important personal goal. You said you lose motivation — that's 8 out of 10 students, not a character flaw.",
    source: 'StageofLife Teen Trend Report; University of Scranton (n=500+)',
  },
  time_scarcity: {
    headline: '20%',
    sub: 'of study time',
    body: "is silently lost to micro-distractions — about 3.5 phone pickups per hour. You said time is scarce, but some of it is being stolen without you noticing.",
    source: 'Journal of Media Education / Aura Passive Sensing (n=675)',
  },
  system_failure: {
    headline: '92%',
    sub: 'of long-term goals',
    body: "fail without structural support. You said you need a better system — the data says that's exactly right. It was never about willpower.",
    source: 'University of Scranton Resolution Study (2013–2023)',
  },
}

// --- Helpers ---

function loadDraft(): OnboardingState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OnboardingState
  } catch {
    return null
  }
}

function saveDraft(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// --- Component ---

export default function TapOnboarding() {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<'left' | 'right' | 'fade'>('left')
  const [state, setState] = useState<OnboardingState>({
    category: 'university',
    motivation_type: 'intrinsic',
    deadline_horizon: 'near',
    familiarity_baseline: 5,
    completion_rate_history: 0.65,
    free_time_slots: [],
    time_scarce: false,
    primary_blocker: 'directionless',
    name: '',
    goal_title: '',
    grade: 'grade_10',
  })
  const [customCategory, setCustomCategory] = useState('')
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Auth step state
  const [authState, setAuthState] = useState<AuthStepState>({
    selectedRole: 'STUDENT',
    email: '',
    password: '',
    confirmPassword: '',
    isUnder18: false,
    consentAgreed: false,
  })
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [authError, setAuthError] = useState('')

  // --- Restore draft on mount ---
  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      setState(draft)
      if (draft.category === 'custom' && draft.category_text) {
        setCustomCategory(draft.category_text)
      }
    }
  }, [])

  // --- Persist draft on every state change ---
  useEffect(() => {
    if (step < 18) {
      saveDraft(state)
    }
  }, [state, step])

  // --- Navigation Helpers ---

  const nextStep = useCallback((newDirection: 'left' | 'right' | 'fade' = 'left') => {
    setDirection(newDirection)
    setStep((prev) => prev + 1)
  }, [])

  const prevStep = useCallback(() => {
    if (step === 1) {
      if (confirm('Leave onboarding? Your progress is saved locally.')) {
        router.push('/')
      }
      return
    }
    setDirection('right')
    setStep((prev) => prev - 1)
  }, [step, router])

  const handleSingleSelect = useCallback((field: keyof OnboardingState, value: OnboardingState[keyof OnboardingState], delay = 400) => {
    setState((prev) => ({ ...prev, [field]: value }))
    setTimeout(() => {
      let nextDir: 'left' | 'fade' = 'left'
      if (FADE_TRANSITION_STEPS.has(step)) {
        nextDir = 'fade'
      }
      nextStep(nextDir)
    }, delay)
  }, [step, nextStep])

  // --- Screen Logic ---

  const getReactiveScreens = () => {
    const screens = ['A', 'B']
    const isC1 = state.time_scarce && (state.deadline_horizon === 'urgent' || state.deadline_horizon === 'near')
    const isC2 = state.familiarity_baseline >= 7 && state.completion_rate_history <= 0.35
    const isC3 = state.familiarity_baseline <= 3 && state.deadline_horizon === 'urgent'
    if (isC1 || isC2 || isC3) {
      screens.push('C')
    }
    return screens
  }

  const reactiveScreens = getReactiveScreens()

  // Loading animation
  useEffect(() => {
    if (step === LOADING_STEP) {
      setIsLoadingProfile(true)
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setTimeout(() => {
              setIsLoadingProfile(false)
              nextStep('fade')
            }, 500)
            return 100
          }
          return prev + 5
        })
      }, 100)
      return () => clearInterval(interval)
    }
    return undefined
  }, [step, nextStep])

  // --- DB Write After Auth ---

  const completeOnboarding = async (userId: string) => {
    // Update user profile
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        name: state.name.trim(),
        grade: state.grade,
        onboarding_complete: true,
        primary_blocker: state.primary_blocker,
        schedule: {
          free_time_slots: state.free_time_slots,
          time_scarce: state.time_scarce,
          committed_hours: [],
          daily_free_time_hours: null,
          preferred_study_times: state.free_time_slots,
        },
        gate_pace: 0,
        pace_gap: 1.0,
        gates_cleared_log: [],
        disc_profile: { task_people: 0.5, fast_slow: 0.5 },
        patterns: {},
        daily_minutes_log: [],
      })
      .eq('id', userId)

    if (userUpdateError) throw userUpdateError

    // Create root goal
    const { data: goalData, error: goalError } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        title: state.goal_title.trim(),
        category: state.category,
        category_text: state.category_text ?? null,
        motivation_type: state.motivation_type,
        deadline_horizon: state.deadline_horizon,
        familiarity_baseline: state.familiarity_baseline,
        completion_rate_history: state.completion_rate_history,
        status: 'ACTIVE',
        priority_rank: 1,
        north_star: state.goal_title.trim(),
      })
      .select('id')
      .single()

    if (goalError) throw goalError

    // Create root constellation node
    const { error: nodeError } = await supabase
      .from('nodes')
      .insert({
        user_id: userId,
        goal_id: goalData.id,
        seniority_level: 0,
        label: state.goal_title.trim(),
        cluster_id: state.category,
        file_path: `/vault/north_star/${state.goal_title.trim().replace(/\s+/g, '_')}.md`,
        tags: ['north_star', state.category],
        status: 'ACTIVE',
        familiarity_score: state.familiarity_baseline,
        metadata: {
          familiarity_score: state.familiarity_baseline,
          deadline_horizon: state.deadline_horizon,
          motivation_type: state.motivation_type,
          primary_blocker: state.primary_blocker,
          completion_rate_history: state.completion_rate_history,
          origin_source: 'onboarding',
          last_updated: new Date().toISOString(),
        },
      })

    if (nodeError) throw nodeError
  }

  // --- Auth Submit ---

  const handleAuthSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    setAuthError('')

    try {
      if (authMode === 'signup') {
        // Validation
        if (!authState.selectedRole) {
          setAuthError('Please select your role')
          setIsSubmitting(false)
          return
        }
        if (!authState.email || !authState.password || !authState.confirmPassword) {
          setAuthError('Please fill in all fields')
          setIsSubmitting(false)
          return
        }
        if (authState.password !== authState.confirmPassword) {
          setAuthError('Passwords do not match')
          setIsSubmitting(false)
          return
        }
        if (authState.password.length < 6) {
          setAuthError('Password must be at least 6 characters')
          setIsSubmitting(false)
          return
        }
        if (authState.isUnder18 && !authState.consentAgreed) {
          setAuthError('You must agree to the consent terms to create an account')
          setIsSubmitting(false)
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: authState.email,
          password: authState.password,
          options: {
            data: {
              role: authState.selectedRole,
              is_under_18: authState.isUnder18,
            },
          },
        })

        if (signUpError) {
          setAuthError(signUpError.message)
          setIsSubmitting(false)
          return
        }

        if (data.user) {
          await completeOnboarding(data.user.id)
          clearDraft()
          router.push('/app')
        }
      } else {
        // Login mode
        if (!authState.email || !authState.password) {
          setAuthError('Please fill in all fields')
          setIsSubmitting(false)
          return
        }

        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: authState.email,
          password: authState.password,
        })

        if (loginError) {
          setAuthError(loginError.message)
          setIsSubmitting(false)
          return
        }

        if (data.user) {
          await completeOnboarding(data.user.id)
          clearDraft()
          router.push('/app')
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setSubmitError('Something went wrong saving your profile. Please try again.')
      console.error('Error saving onboarding data:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleAuth = async () => {
    setIsSubmitting(true)
    setAuthError('')

    // Save onboarding data + auth mode to sessionStorage for post-OAuth completion
    try {
      sessionStorage.setItem('mynorth_onboarding_oauth', JSON.stringify({
        onboardingData: state,
        authMode: 'signup',
      }))
    } catch {
      // ignore
    }

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (googleError) {
      setAuthError(googleError.message)
      setIsSubmitting(false)
    }
  }

  // --- Render Helpers ---

  interface OptionCardProps {
    label: string
    value: string | number
    field: keyof OnboardingState
    selected: boolean
    delay?: number
  }

  const OptionCard = ({ label, value, field, selected, delay = 400 }: OptionCardProps) => (
    <button
      onClick={() => handleSingleSelect(field, value, delay)}
      className={`w-full p-5 text-left rounded-xl border-2 transition-all duration-300 ${selected
        ? 'bg-gray-50 border-gray-700 scale-[1.02]'
        : 'bg-white border-gray-100 hover:border-gray-300'
        }`}
    >
      <span className="text-lg font-medium text-gray-900">{label}</span>
    </button>
  )

  const ProgressBar = ({ current, total }: { current: number; total: number }) => (
    <div className="fixed top-0 left-0 w-full h-1.5 bg-gray-50 z-50">
      <div
        className="h-full bg-gray-700 transition-all duration-500 ease-out"
        style={{ width: `${(current / total) * 100}%` }}
      />
    </div>
  )

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Global Progress Bar (only on data screens) */}
      {PROGRESS_BAR_STEPS.includes(step) && (
        <ProgressBar current={PROGRESS_BAR_STEPS.indexOf(step) + 1} total={PROGRESS_BAR_STEPS.length} />
      )}

      {/* Back Button */}
      {step < TOTAL_STEPS && (
        <button
          onClick={prevStep}
          className="absolute top-8 left-8 p-2 text-gray-900/60 hover:text-gray-900 transition-colors z-50"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
      )}

      <div className={`w-full max-w-xl transition-all duration-300 ${direction === 'left' ? 'animate-in slide-in-from-right' :
        direction === 'right' ? 'animate-in slide-in-from-left' : 'animate-in fade-in duration-500'
        }`}>

        {/* --- PHASE 1: GOAL PROFILING --- */}

        {step === 1 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">What&apos;s the big thing you&apos;re working toward?</h1>
            <p className="text-gray-900/60">Pick the one that feels closest.</p>
            <div className="space-y-3">
              {[
                { label: 'Get into a specific university', value: 'university' },
                { label: 'Do well in school / improve my grades', value: 'grades' },
                { label: 'Pass a major exam (SNBT, SAT, IB, A-Levels...)', value: 'exam' },
                { label: 'Build a skill (coding, music, language, sport...)', value: 'skill' },
                { label: 'Figure out what I want to do with my life', value: 'direction' },
                { label: 'Something else', value: 'custom' },
              ].map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                  field="category"
                  selected={state.category === opt.value}
                />
              ))}
              {state.category === 'custom' && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Tell me in a few words"
                    className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none transition-all"
                    maxLength={60}
                    autoFocus
                  />
                  <button
                    disabled={!customCategory.trim()}
                    onClick={() => {
                      setState(prev => ({ ...prev, category_text: customCategory }))
                      nextStep()
                    }}
                    className="w-full mt-3 bg-gray-700 text-white p-4 rounded-xl font-bold disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              Why does {state.category === 'custom' ? (state.category_text || 'this goal') : {
                university: 'getting into university',
                grades: 'improving your grades',
                exam: 'passing this exam',
                skill: 'building this skill',
                direction: 'finding your direction',
              }[state.category as Category]} matter to you?
            </h1>
            <p className="text-gray-900/60">Be honest — this changes how I work with you.</p>
            <div className="space-y-3">
              {[
                { label: "It's what I genuinely want for myself", value: 'intrinsic' },
                { label: 'My family expects it from me', value: 'extrinsic_family' },
                { label: "I don't want to fall behind my peers", value: 'extrinsic_peer' },
                { label: "I'm not sure yet — I just know I need to do something", value: 'unclear' },
                { label: 'It connects to something bigger I care about', value: 'intrinsic' },
              ].map((opt, i) => (
                <OptionCard
                  key={i}
                  label={opt.label}
                  value={opt.value}
                  field="motivation_type"
                  selected={state.motivation_type === opt.value}
                />
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">When&apos;s the real deadline — the moment it actually matters?</h1>
            <div className="space-y-3">
              {[
                { label: 'Less than a year', value: 'urgent' },
                { label: '1-2 years', value: 'near' },
                { label: '2-3 years', value: 'medium' },
                { label: 'More than 3 years away', value: 'long' },
              ].map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                  field="deadline_horizon"
                  selected={state.deadline_horizon === opt.value}
                />
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">How much do you already know about this?</h1>
            <p className="text-gray-900/60">This isn&apos;t a test. You can be honest. Overestimating wastes your time.</p>
            <div className="space-y-3">
              {[
                { label: 'Starting from zero', value: 1, color: 'bg-gray-50' },
                { label: 'I know the basics', value: 3, color: 'bg-gray-100' },
                { label: "I've got some experience", value: 5, color: 'bg-gray-200' },
                { label: 'I&apos;m fairly knowledgeable', value: 7, color: 'bg-gray-300' },
                { label: 'I&apos;m nearly there', value: 9, color: 'bg-gray-400' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSingleSelect('familiarity_baseline', opt.value)}
                  className={`w-full p-5 text-left rounded-xl border-2 transition-all duration-300 ${state.familiarity_baseline === opt.value
                    ? 'border-gray-700 scale-[1.02] shadow-md'
                    : 'border-gray-100 hover:border-gray-300'
                    } ${opt.color}`}
                >
                  <span className="text-lg font-medium text-gray-900">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- PHASE 2: SELF-ASSESSMENT --- */}

        {step === 5 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">When you&apos;ve made plans or set goals before, what usually happens?</h1>
            <p className="text-gray-900/60">This shapes how I build your plan.</p>
            <div className="space-y-3">
              {[
                { label: 'I follow through most of the time', value: 0.85 },
                { label: 'I start strong but fade out', value: 0.55 },
                { label: 'It depends on how much I care', value: 0.65 },
                { label: "I've struggled to stick with things", value: 0.35 },
                { label: "I've never really had a plan before", value: 0.50 },
              ].map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                  field="completion_rate_history"
                  selected={state.completion_rate_history === opt.value}
                />
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">When do you usually have time to actually work on this?</h1>
            <p className="text-gray-900/60">Be realistic. not your ideal schedule, your actual one.</p>
            <div className="space-y-3">
              {[
                { label: 'Early mornings, before school', value: 'morning' },
                { label: 'After school / early evenings', value: 'afternoon' },
                { label: 'Late nights', value: 'night' },
                { label: 'Weekends mostly', value: 'weekend' },
                { label: 'I barely have free time right now', value: 'scarce' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setState(prev => {
                      const current = prev.free_time_slots
                      let next: TimeSlot[] = []
                      if (opt.value === 'scarce') {
                        next = prev.time_scarce ? [] : ['scarce']
                      } else {
                        if (current.includes(opt.value as TimeSlot)) {
                          next = current.filter(s => s !== opt.value)
                        } else {
                          const cleaned = current.filter(s => s !== 'scarce')
                          if (cleaned.length < 2) {
                            next = [...cleaned, opt.value as TimeSlot]
                          } else {
                            next = [cleaned[1], opt.value as TimeSlot]
                          }
                        }
                      }
                      return {
                        ...prev,
                        free_time_slots: next,
                        time_scarce: next.includes('scarce')
                      }
                    })
                  }}
                  className={`w-full p-5 text-left rounded-xl border-2 transition-all duration-300 ${state.free_time_slots.includes(opt.value as TimeSlot)
                    ? 'bg-gray-50 border-gray-700'
                    : 'bg-white border-gray-100 hover:border-gray-300'
                    }`}
                >
                  <span className="text-lg font-medium text-gray-900">{opt.label}</span>
                </button>
              ))}
              <button
                disabled={state.free_time_slots.length === 0}
                onClick={() => nextStep()}
                className="w-full mt-6 bg-gray-700 text-white p-5 rounded-xl font-bold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">What&apos;s been getting in the way of making real progress?</h1>
            <p className="text-gray-900/60">Pick the one that hits closest.</p>
            <div className="space-y-3">
              {[
                { label: "I don't know where to start", value: 'directionless' },
                { label: 'I get distracted too easily', value: 'distraction' },
                { label: 'I start but lose motivation after a while', value: 'motivation_decay' },
                { label: 'School and life keep eating my time', value: 'time_scarcity' },
                { label: "I don't have a system that actually works", value: 'system_failure' },
              ].map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                  field="primary_blocker"
                  selected={state.primary_blocker === opt.value}
                />
              ))}
            </div>
          </div>
        )}

        {/* --- BRIDGE: TRUST SCREEN --- */}

        {step === 8 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-10">
            <p className="text-sm font-medium text-gray-900/50 uppercase tracking-widest">The research says</p>
            <div className="space-y-2">
              <div className="text-7xl font-black text-gray-900 tabular-nums">
                {BLOCKER_STATS[state.primary_blocker].headline}
              </div>
              <div className="text-lg font-medium text-gray-900/60">
                {BLOCKER_STATS[state.primary_blocker].sub}
              </div>
            </div>
            <p className="text-xl text-gray-900 leading-relaxed max-w-md">
              {BLOCKER_STATS[state.primary_blocker].body}
            </p>
            <p className="text-xs text-gray-900/40 max-w-sm">
              {BLOCKER_STATS[state.primary_blocker].source}
            </p>
            <button
              onClick={() => nextStep('fade')}
              className="px-12 py-4 bg-gray-700 text-white rounded-full font-bold shadow-lg hover:shadow-xl transition-all"
            >
              Continue
            </button>
          </div>
        )}

        {/* --- PHASE 3: HOW MORGAN WORKS --- */}

        {step === 9 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-10">
            <h2 className="text-2xl font-bold text-gray-900 text-center leading-tight max-w-md">
              Structure changes the math
            </h2>
            <div className="w-full max-w-sm space-y-5">
              {[
                { label: 'Having an idea', pct: 10, color: 'bg-gray-300' },
                { label: 'Writing it down', pct: 43, color: 'bg-gray-400' },
                { label: 'Writing + weekly check-ins', pct: 76, color: 'bg-gray-600' },
                { label: 'Structured accountability', pct: 95, color: 'bg-gray-900' },
              ].map((tier) => (
                <div key={tier.label} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-900/60">{tier.label}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{tier.pct}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tier.color} rounded-full transition-all duration-700`}
                      style={{ width: `${tier.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-900/70 text-lg max-w-sm">
              {state.completion_rate_history <= 0.50
                ? "You told me follow-through has been hard. That\u2019s because you were at the bottom of this ladder. Morgan puts you at the top."
                : "Morgan gives you the last one \u2014 structured check-ins built around your actual schedule."
              }
            </p>
            <p className="text-xs text-gray-900/40 text-center max-w-sm">
              Dr. Gail Matthews, Dominican University (n=149); Association for Talent Development
            </p>
            <button
              onClick={() => nextStep()}
              className="w-full max-w-sm bg-gray-700 text-white p-5 rounded-xl font-bold"
            >
              Next
            </button>
          </div>
        )}

        {step === 10 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-10">
            <h2 className="text-2xl font-bold text-gray-900 text-center leading-tight max-w-md">
              Real habits take longer than you think
            </h2>
            <div className="w-full max-w-sm px-4">
              <div className="relative h-16">
                <div className="absolute top-3 left-0 right-0 h-2 bg-gray-100 rounded-full" />
                <div className="absolute top-3 left-0 h-2 bg-gray-900 rounded-full" style={{ width: '100%' }} />
                <div className="absolute left-0 top-0 flex flex-col items-center" style={{ transform: 'translateX(0%)' }}>
                  <div className="w-4 h-4 bg-gray-400 rounded-full border-2 border-white shadow-sm" />
                  <span className="text-xs text-gray-900/50 mt-3">Day 1</span>
                </div>
                <div className="absolute top-0 flex flex-col items-center" style={{ left: '31.8%', transform: 'translateX(-50%)' }}>
                  <div className="w-4 h-4 bg-red-300 rounded-full border-2 border-white shadow-sm" />
                  <div className="mt-3 text-center">
                    <div className="text-xs font-medium text-red-400">Day 21</div>
                    <div className="text-[10px] text-red-400/70">the myth</div>
                  </div>
                </div>
                <div className="absolute top-0 flex flex-col items-center" style={{ left: '100%', transform: 'translateX(-100%)' }}>
                  <div className="w-5 h-5 bg-gray-900 rounded-full border-2 border-white shadow-md" />
                  <div className="mt-3 text-center">
                    <div className="text-xs font-bold text-gray-900">Day 66</div>
                    <div className="text-[10px] text-gray-900/60">the reality</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="max-w-sm space-y-4 text-center">
              <p className="text-lg text-gray-900 leading-relaxed">
                Most people quit at week 3 because they were told it should be automatic by then. It shouldn&apos;t be. The brain takes <span className="font-bold">66 days on average</span> to cement a new behavior.
              </p>
              <p className="text-lg text-gray-900/70">
                Morgan is built for the long game — not the first 21 days, but all 66.
              </p>
              {state.deadline_horizon === 'urgent' && (
                <p className="text-sm text-gray-900/50 italic">
                  Your deadline is tight. We won&apos;t wait 66 days to see results — but we&apos;ll build habits that outlast the deadline.
                </p>
              )}
            </div>
            <p className="text-xs text-gray-900/40 text-center max-w-sm">
              Phillippa Lally, UCL, European Journal of Social Psychology (n=96, 2009)
            </p>
            <button
              onClick={() => nextStep('fade')}
              className="w-full max-w-sm bg-gray-700 text-white p-5 rounded-xl font-bold"
            >
              Next
            </button>
          </div>
        )}

        {/* --- PHASE 4: REACTIVE INSIGHT --- */}

        {step === 11 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8">
            <h2 className="text-2xl font-medium text-gray-900">Building your profile...</h2>
            <div className="w-full h-1 bg-gray-50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-700 transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        {step === 12 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-10">
            {(state.category === 'direction' || state.motivation_type === 'unclear') && (
              <div className="text-center space-y-1">
                <div className="text-5xl font-black text-gray-900">1 in 5</div>
                <div className="text-sm text-gray-900/50">students have a clear sense of purpose</div>
              </div>
            )}
            {(state.motivation_type === 'extrinsic_family' || state.motivation_type === 'extrinsic_peer') && (
              <div className="text-center space-y-1">
                <div className="text-5xl font-black text-gray-900">r = 0.39</div>
                <div className="text-sm text-gray-900/50">intrinsic motivation &rarr; academic performance</div>
              </div>
            )}
            {state.motivation_type === 'intrinsic' && state.category !== 'direction' && (
              <div className="text-center space-y-1">
                <div className="text-5xl font-black text-gray-900">Top 20%</div>
                <div className="text-sm text-gray-900/50">of self-directed youth</div>
              </div>
            )}
            <div className="max-w-lg text-xl text-gray-900 leading-relaxed space-y-6">
              {state.category === 'direction' || state.motivation_type === 'unclear' ? (
                <p>
                  &quot;Not knowing exactly what you want right now is the most normal thing in the world — about 80% of students your age are in the same place. What&apos;s different about you is that you&apos;re here, doing this. Most people with vague goals just drift. You&apos;re trying to figure it out. That&apos;s the only thing that separates people who eventually get clear from people who don&apos;t.&quot;
                </p>
              ) : state.motivation_type === 'extrinsic_family' || state.motivation_type === 'extrinsic_peer' ? (
                <p>
                  &quot;You know what you&apos;re aiming for, and that matters. But something I want us to come back to: the reason you gave me feels like it belongs more to the people around you than to you. That&apos;s not a criticism, it&apos;s just something I noticed. Research shows that goals driven purely by outside pressure burn people out faster and stick less. We don&apos;t have to solve that today, but I&apos;m keeping an eye on it.&quot;
                </p>
              ) : (
                <p>
                  &quot;You actually know what you want and why you want it. That sounds obvious, but it isn&apos;t — only about 1 in 5 students your age can say the same thing. Most have vague ideas, or goals that belong to someone else. The fact that yours is yours already puts you in a different position.&quot;
                </p>
              )}
            </div>
            <p className="text-xs text-gray-900/40 text-center max-w-sm">
              {(state.category === 'direction' || state.motivation_type === 'unclear')
                ? 'William Damon, Stanford Center on Adolescence (n=1,200)'
                : (state.motivation_type === 'extrinsic_family' || state.motivation_type === 'extrinsic_peer')
                  ? 'Frontiers in Education; Self-Determination Theory (Deci & Ryan)'
                  : 'William Damon, Stanford Center on Adolescence (n=1,200)'
              }
            </p>
            <button
              onClick={() => nextStep()}
              className="px-12 py-4 bg-gray-700 text-white rounded-full font-bold shadow-lg"
            >
              Next
            </button>
          </div>
        )}

        {step === 13 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-10">
            <div className="text-center space-y-1">
              {state.completion_rate_history >= 0.80 ? (
                <>
                  <div className="text-5xl font-black text-gray-900">d = 1.44</div>
                  <div className="text-sm text-gray-900/50">effect size when you set specific self-expectations</div>
                </>
              ) : state.completion_rate_history >= 0.45 ? (
                <>
                  <div className="text-5xl font-black text-gray-900">76%</div>
                  <div className="text-sm text-gray-900/50">success rate with written goals + tracking</div>
                </>
              ) : (
                <>
                  <div className="text-5xl font-black text-gray-900">90%+</div>
                  <div className="text-sm text-gray-900/50">of goals fail without structural support</div>
                </>
              )}
            </div>
            <div className="max-w-lg text-xl text-gray-900 leading-relaxed space-y-6">
              {state.completion_rate_history >= 0.80 ? (
                <p>
                  &quot;You told me you follow through most of the time. I&apos;ll hold you to that — and more importantly, I&apos;ll be watching for the moments when you don&apos;t, because everyone has them. The research is pretty clear: even people with strong follow-through histories hit walls when the stakes get higher or the goal gets longer. My job isn&apos;t to celebrate the streak. It&apos;s to help you protect it.&quot;
                </p>
              ) : state.completion_rate_history >= 0.45 ? (
                <p>
                  &quot;You said you follow through sometimes. That&apos;s honest, and it&apos;s more common than people admit — most students drop their biggest goals at some point. What the data actually shows is that follow-through isn&apos;t a personality trait. It&apos;s almost entirely about whether the system around you is built well. That&apos;s what we&apos;re building now. The goal is that by the time something hard comes up, the structure does the heavy lifting, not your willpower.&quot;
                </p>
              ) : (
                <p>
                  &quot;You told me you rarely follow through. I appreciate the honesty — that&apos;s actually the most useful thing you could have said. Here&apos;s what I want you to know: over 90% of long-term goals fail without the right structure around them. That&apos;s not a character flaw. It&apos;s what happens when someone tries to do something hard without the right infrastructure. I&apos;m going to build your plan around that reality — smaller steps, more frequent check-ins, and no &apos;just push through it&apos; advice. Those systems fail people like you. We&apos;re building a different one.&quot;
                </p>
              )}
            </div>
            <p className="text-xs text-gray-900/40 text-center max-w-sm">
              {state.completion_rate_history >= 0.80
                ? 'John Hattie, Visible Learning (800+ meta-analyses)'
                : state.completion_rate_history >= 0.45
                  ? 'Dr. Gail Matthews, Dominican University (n=149)'
                  : 'University of Scranton; Association for Talent Development'
              }
            </p>
            <button
              onClick={() => {
                if (reactiveScreens.includes('C')) {
                  nextStep()
                } else {
                  setDirection('fade')
                  setStep(15)
                }
              }}
              className="px-12 py-4 bg-gray-700 text-white rounded-full font-bold shadow-lg"
            >
              Next
            </button>
          </div>
        )}

        {step === 14 && reactiveScreens.includes('C') && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-12">
            <div className="max-w-lg text-xl text-gray-900 leading-relaxed space-y-6">
              {state.time_scarce && (state.deadline_horizon === 'urgent' || state.deadline_horizon === 'near') ? (
                <p>
                  &quot;You said you barely have free time, and your deadline is close. That&apos;s a real constraint, and I&apos;m not going to pretend it isn&apos;t. What I can tell you is this: research on AI-assisted learning shows that 30 focused minutes per week — not per day, per week — is enough to shift outcomes by about 20%. We&apos;re not going to chase time we don&apos;t have. We&apos;re going to make the time you do have count for a lot more.&quot;
                </p>
              ) : state.familiarity_baseline >= 7 && state.completion_rate_history <= 0.35 ? (
                <p>
                  &quot;You said you already know a fair amount about this, but you also told me you&apos;ve struggled to follow through. I want to flag something, not as a judgment but as a data point: students who feel they already know a subject well are actually more likely to underestimate the work still ahead of them. I&apos;m not saying you&apos;re wrong about your level. I&apos;m saying I&apos;ll be checking it as we go, and if something looks off, I&apos;ll tell you.&quot;
                </p>
              ) : (
                <p>
                  &quot;You&apos;re starting close to zero on this and the deadline is less than 3 months out. I&apos;m going to be straight with you: the gap is real, and the timeline is tight. I&apos;m not going to sugarcoat the math. What I will do is break this into steps that are each just a little bit harder than the last, because that&apos;s how the brain actually learns — not in big jumps, but in manageable stretches. We start today, and we don&apos;t skip steps.&quot;
                </p>
              )}
            </div>
            <button
              onClick={() => nextStep('fade')}
              className="px-12 py-4 bg-gray-700 text-white rounded-full font-bold shadow-lg"
            >
              Next
            </button>
          </div>
        )}

        {/* --- PHASE 5: IDENTITY --- */}

        {step === 15 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">What should I call you?</h1>
            <input
              type="text"
              value={state.name}
              onChange={(e) => setState(prev => ({ ...prev, name: e.target.value }))}
              placeholder="First name"
              className="w-full p-5 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none text-xl"
              maxLength={30}
              autoFocus
            />
            <button
              disabled={state.name.trim().length < 1}
              onClick={() => nextStep()}
              className="w-full bg-gray-700 text-white p-5 rounded-xl font-bold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {step === 16 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">What exactly are you working toward?</h1>
            <p className="text-gray-900/60">
              {state.category === 'university' && 'Which university or program?'}
              {state.category === 'grades' && 'What grades are you aiming for?'}
              {state.category === 'exam' && 'Which exam and what score?'}
              {state.category === 'skill' && 'What skill and what level?'}
              {state.category === 'direction' && 'What are you trying to figure out?'}
              {state.category === 'custom' && 'Describe your goal in one sentence'}
            </p>
            <input
              type="text"
              value={state.goal_title}
              onChange={(e) => setState(prev => ({ ...prev, goal_title: e.target.value }))}
              placeholder={
                state.category === 'university' ? 'e.g. Get into UI Ilmu Komputer' :
                  state.category === 'grades' ? 'e.g. Get a 3.8 GPA this semester' :
                    state.category === 'exam' ? 'e.g. Score 700+ on SAT Math' :
                      state.category === 'skill' ? 'e.g. Learn Python to build my first app' :
                        state.category === 'direction' ? 'e.g. Figure out if I want to do business or science' : 'Describe your goal'
              }
              className="w-full p-5 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none text-xl"
              maxLength={80}
              autoFocus
            />
            <button
              disabled={state.goal_title.trim().length < 5}
              onClick={() => nextStep()}
              className="w-full bg-gray-700 text-white p-5 rounded-xl font-bold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {step === 17 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">What year are you in?</h1>
            <div className="space-y-3">
              {[
                { label: 'Grade 10', value: 'grade_10' },
                { label: 'Grade 11', value: 'grade_11' },
                { label: 'Grade 12', value: 'grade_12' },
                { label: 'First year of college/university', value: 'college_1' },
                { label: 'Other', value: 'other' },
              ].map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                  field="grade"
                  selected={state.grade === opt.value}
                />
              ))}
            </div>
          </div>
        )}

        {/* --- STEP 18: AUTH (Sign up or Log in to save progress) --- */}

        {step === 18 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">Save your progress, {state.name}</h1>
              <p className="text-gray-900/60">Create an account or sign in — your plan will be saved forever.</p>
            </div>

            <div className="w-full space-y-4">
              {/* Google Auth */}
              <button
                onClick={handleGoogleAuth}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border-2 border-gray-300 rounded-xl bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c3.11 0 5.71-1.03 7.62-2.81l-3.57-2.77c-.98.66-2.23 1.06-3.75 1.06-2.88 0-5.32-1.94-6.19-4.55H2.54v2.91C4.46 20.61 8 23 12 23z" />
                  <path fill="#FBBC05" d="M5.81 13.93c-.22-.66-.35-1.36-.35-2.08s.13-1.42.35-2.08V6.86H2.54C1.61 8.61 1.08 10.61 1.08 12.75s.53 4.14 1.46 5.89l3.27-2.71z" />
                  <path fill="#EA4335" d="M12 5.38c1.69 0 3.21.58 4.41 1.72l3.31-3.31C17.71 1.79 15.11.75 12 .75c-4 0-7.54 2.39-9.46 5.86l3.27 3.07c.87-2.61 3.31-4.55 12-4.55z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 text-gray-500 uppercase">or</span>
                </div>
              </div>

              {/* Auth Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${authMode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Create Account
                </button>
                <button
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${authMode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Sign In
                </button>
              </div>

              {/* Role Selector (signup only) */}
              {authMode === 'signup' && (
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'STUDENT' as Role, label: "I'm a Student" },
                    { value: 'COUNSELOR' as Role, label: "I'm a Counselor" },
                    { value: 'PARENT' as Role, label: "I'm a Parent" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAuthState(prev => ({ ...prev, selectedRole: opt.value }))}
                      className={`p-3 rounded-lg border-2 text-left transition-all text-sm ${authState.selectedRole === opt.value
                        ? 'border-gray-700 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                    >
                      <span className="font-semibold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Email */}
              <input
                type="email"
                value={authState.email}
                onChange={(e) => setAuthState(prev => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
                className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none transition-all"
                required
              />

              {/* Password */}
              <input
                type="password"
                value={authState.password}
                onChange={(e) => setAuthState(prev => ({ ...prev, password: e.target.value }))}
                placeholder={authMode === 'signup' ? 'Min 6 characters' : 'Your password'}
                className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none transition-all"
                required
              />

              {/* Confirm Password (signup only) */}
              {authMode === 'signup' && (
                <input
                  type="password"
                  value={authState.confirmPassword}
                  onChange={(e) => setAuthState(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm your password"
                  className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-gray-700 outline-none transition-all"
                  required
                />
              )}

              {/* Under-18 Checkbox (signup only) */}
              {authMode === 'signup' && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={authState.isUnder18}
                      onChange={(e) => {
                        setAuthState(prev => ({ ...prev, isUnder18: e.target.checked }))
                        if (!e.target.checked) setAuthState(prev => ({ ...prev, consentAgreed: false }))
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                    />
                    <span className="text-sm text-gray-900">I am under 18 years old</span>
                  </label>

                  {authState.isUnder18 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-left">
                      <p className="text-sm text-amber-800 font-medium mb-2">
                        Parental / Guardian Consent Required
                      </p>
                      <p className="text-sm text-amber-700 mb-3">
                        Because you are under 18, a parent or legal guardian must consent to your
                        use of MyNorth. By checking the box below, you confirm that your parent or
                        guardian has reviewed and agrees to the Terms of Service and Privacy Policy.
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={authState.consentAgreed}
                          onChange={(e) => setAuthState(prev => ({ ...prev, consentAgreed: e.target.checked }))}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                        />
                        <span className="text-sm text-amber-800">
                          I confirm that my parent or guardian has reviewed and agrees to the above terms
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Error Messages */}
              {(authError || submitError) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {authError || submitError}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleAuthSubmit}
                disabled={isSubmitting}
                className="w-full bg-gray-700 text-white p-5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 hover:bg-gray-800 transition-colors"
              >
                {isSubmitting
                  ? (authMode === 'signup' ? 'Creating Account...' : 'Signing In...')
                  : (authMode === 'signup' ? 'Create Account & Save Plan' : 'Sign In & Save Plan')
                }
              </button>

              <p className="text-xs text-gray-900/40">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
