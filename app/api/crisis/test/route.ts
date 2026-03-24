import { NextRequest, NextResponse } from 'next/server'
import { detectCrisisKeywords, buildCrisisResponse, SAFETY_RESOURCES } from '@/lib/crisis-detection'

/**
 * POST /api/crisis/test
 * Test crisis detection without affecting real data
 * Usage:
 *   curl -X POST http://localhost:3000/api/crisis/test \
 *     -H "Content-Type: application/json" \
 *     -d '{"message": "I am feeling suicidal", "tone": "supportive"}'
 */
export async function POST(req: NextRequest) {
  const { message, tone = 'supportive' } = await req.json()

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  try {
    const detection = detectCrisisKeywords(message)

    let response = ''
    if (detection.detected) {
      response = buildCrisisResponse(detection.severity!, tone as any)
    } else {
      response = 'No crisis detected in this message.'
    }

    return NextResponse.json({
      success: true,
      input: {
        message,
        tone,
      },
      detection: {
        detected: detection.detected,
        severity: detection.severity,
        confidence: detection.confidence,
        keywords: detection.keywords,
        requiresCounselorAlert: detection.requiresCounselorAlert,
      },
      response,
      availableResources: detection.detected
        ? SAFETY_RESOURCES.filter((r) =>
            detection.severity === 'T1_IMMINENT'
              ? r.category === 'crisis'
              : r.category !== 'academic'
          )
        : [],
    })
  } catch (error: any) {
    console.error('Test error:', error)
    return NextResponse.json({ error: error.message || 'Test failed' }, { status: 500 })
  }
}
