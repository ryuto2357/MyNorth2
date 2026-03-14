'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface OnboardingStep {
  name: string
  question: string
  hint: string
  type: string
}

const steps: OnboardingStep[] = [
  {
    name: 'name',
    question: "What's your name?",
    hint: 'Let Morgan know who she\'s working with',
    type: 'text',
  },
  {
    name: 'age',
    question: 'How old are you, and what school do you attend?',
    hint: 'This helps us understand your context',
    type: 'composite',
  },
  {
    name: 'goal',
    question: 'What\'s the big thing you\'re working toward?',
    hint: 'Don\'t filter it. Just say it. (e.g., "Get into NUS", "Master Python", "Prepare for SNBT")',
    type: 'text',
  },
  {
    name: 'why',
    question: 'Why does this goal matter to you?',
    hint: 'Not the obvious answer — the real one. What will reaching this goal change?',
    type: 'textarea',
  },
  {
    name: 'deadline',
    question: 'By when do you want to achieve this?',
    hint: 'Give us a realistic deadline',
    type: 'date',
  },
  {
    name: 'familiarity',
    question: 'How familiar are you with this already?',
    hint: 'Rate yourself from 0 (beginner) to 10 (expert)',
    type: 'range',
  },
  {
    name: 'freeTime',
    question: 'How many hours of free time do you have daily?',
    hint: 'Time available after school/work and commitments',
    type: 'number',
  },
  {
    name: 'completion',
    question: 'When you\'ve made plans before, how often do you follow through?',
    hint: 'Be honest with yourself',
    type: 'select',
  },
]

export default function OnboardingForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    school: '',
    grade: '',
    goal: '',
    why: '',
    deadline: '',
    familiarity: 5,
    freeTime: 2,
    completion: '',
  })

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNext = () => {
    const currentStepData = steps[currentStep]
    setError('')

    // Validation
    if (currentStepData.name === 'name' && !formData.name.trim()) {
      setError('Please enter your name')
      return
    }

    if (currentStepData.name === 'age' && (!formData.age || !formData.school || !formData.grade)) {
      setError('Please fill in all fields')
      return
    }

    if (currentStepData.name === 'goal' && !formData.goal.trim()) {
      setError('Please describe your goal')
      return
    }

    if (currentStepData.name === 'why' && !formData.why.trim()) {
      setError('Please share why this goal matters')
      return
    }

    if (currentStepData.name === 'deadline' && !formData.deadline) {
      setError('Please select a deadline')
      return
    }

    if (currentStepData.name === 'completion' && !formData.completion) {
      setError('Please select an option')
      return
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      setError('')
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      // Validate completion field
      if (!formData.completion) {
        setError('Please complete all steps')
        setLoading(false)
        return
      }

      // Map completion to history
      const completionMap: { [key: string]: number } = {
        'most': 0.85,
        'sometimes': 0.60,
        'rarely': 0.35,
      }

      const completionRate = completionMap[formData.completion] || 0.6

      // Verify user exists in database (trigger should have created it, but check just in case)
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single()

      if (!existingUser && !userCheckError) {
        // User doesn't exist and no error - create it manually
        const { error: createUserError } = await supabase
          .from('users')
          .insert([{ id: userId, email: '', onboarding_complete: false }])

        if (createUserError) {
          setError('Failed to create user profile: ' + createUserError.message)
          setLoading(false)
          return
        }
      }

      // Create goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .insert([
          {
            user_id: userId,
            title: formData.goal,
            why: formData.why,
            north_star: formData.goal,
            deadline: formData.deadline,
            familiarity_baseline: formData.familiarity,
            completion_rate_history: completionRate,
            status: 'ACTIVE',
          },
        ])
        .select()

      if (goalError) {
        setError(goalError.message)
        setLoading(false)
        return
      }

      const goalId = goalData[0].id

      // Update user profile
      const updateData: any = {
        name: formData.name,
        age: parseInt(formData.age),
        school: formData.school,
        grade: formData.grade,
        onboarding_complete: true,
        schedule: {
          // @ts-ignore
          daily_free_time_hours: parseFloat(formData.freeTime),
          free_time_slots: [],
          committed_hours: [],
        },
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      // Create root node for goal in Constellation
      const { error: nodeError } = await supabase
        .from('nodes')
        .insert([
          {
            user_id: userId,
            goal_id: goalId,
            label: formData.goal,
            seniority_level: 0,
            cluster_id: 'main',
            status: 'ACTIVE',
            familiarity_score: formData.familiarity,
            description: formData.why,
          },
        ])

      if (nodeError) {
        console.error('Node creation error:', nodeError)
      }

      // Redirect to dashboard
      router.push('/app')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  const currentStepData = steps[currentStep]
  const progress = ((currentStep + 1) / steps.length) * 100

  return (
    <div className="card max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-celestial-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-obsidian mb-2">{currentStepData.question}</h2>
        <p className="text-gray-600 text-sm">{currentStepData.hint}</p>
      </div>

      {/* Input Fields */}
      <div className="mb-6 space-y-4">
        {currentStepData.type === 'text' && (
          <input
            type="text"
            value={formData[currentStepData.name as keyof typeof formData]}
            onChange={(e) => handleInputChange(currentStepData.name, e.target.value)}
            className="input-base"
            placeholder="Your answer..."
            autoFocus
          />
        )}

        {currentStepData.type === 'textarea' && (
          <textarea
            value={formData.why}
            onChange={(e) => handleInputChange('why', e.target.value)}
            className="input-base min-h-32 resize-none"
            placeholder="Your answer..."
            autoFocus
          />
        )}

        {currentStepData.type === 'composite' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Age</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => handleInputChange('age', e.target.value)}
                className="input-base"
                placeholder="18"
                min="15"
                max="25"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">School</label>
              <input
                type="text"
                value={formData.school}
                onChange={(e) => handleInputChange('school', e.target.value)}
                className="input-base"
                placeholder="High School name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Grade</label>
              <select
                value={formData.grade}
                onChange={(e) => handleInputChange('grade', e.target.value)}
                className="input-base"
              >
                <option value="">Select grade</option>
                <option value="10">Grade 10</option>
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
              </select>
            </div>
          </div>
        )}

        {currentStepData.type === 'date' && (
          <input
            type="date"
            value={formData.deadline}
            onChange={(e) => handleInputChange('deadline', e.target.value)}
            className="input-base"
          />
        )}

        {currentStepData.type === 'range' && (
          <div className="space-y-3">
            <input
              type="range"
              min="0"
              max="10"
              value={formData.familiarity}
              onChange={(e) => handleInputChange('familiarity', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-600">
              <span>0 (Beginner)</span>
              <span className="font-bold text-celestial-600">{formData.familiarity}</span>
              <span>10 (Expert)</span>
            </div>
          </div>
        )}

        {currentStepData.type === 'number' && (
          <div className="space-y-2">
            <input
              type="number"
              value={formData.freeTime}
              onChange={(e) => handleInputChange('freeTime', e.target.value)}
              className="input-base"
              placeholder="2"
              min="0.5"
              max="10"
              step="0.5"
            />
            <p className="text-xs text-gray-500">Hours per day</p>
          </div>
        )}

        {currentStepData.type === 'select' && (
          <div className="space-y-2">
            {['Most of the time', 'Sometimes', 'Rarely'].map((option) => (
              <label
                key={option}
                className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transitions"
              >
                <input
                  type="radio"
                  name="completion"
                  value={option.toLowerCase().split(' ')[0]}
                  checked={formData.completion === option.toLowerCase().split(' ')[0]}
                  onChange={(e) => handleInputChange('completion', e.target.value)}
                  className="mr-3"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0 || loading}
          className="btn-secondary disabled:opacity-50"
        >
          Back
        </button>

        {currentStep === steps.length - 1 ? (
          <button onClick={handleSubmit} disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? 'Creating your profile...' : 'Complete Onboarding'}
          </button>
        ) : (
          <button onClick={handleNext} className="btn-primary">
            Next
          </button>
        )}
      </div>
    </div>
  )
}
