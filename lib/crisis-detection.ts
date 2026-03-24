/**
 * Crisis Detection & Safety Module
 * Detects potential safety concerns and routes appropriately
 *
 * THREE SEVERITY LEVELS:
 * T1 - IMMINENT: Suicidal ideation, active self-harm, abuse
 *      → Immediate counselor alert + crisis resources
 * T2 - CONCERNING: Depression, anxiety, hopelessness patterns
 *      → Counselor notification + supportive response
 * T3 - MONITORING: Stress, burnout, overwhelm patterns
 *      → Supportive response, suggest break/counselor
 */

export interface CrisisDetectionResult {
  detected: boolean
  severity: 'T1_IMMINENT' | 'T2_CONCERNING' | 'T3_MONITORING' | null
  keywords: string[]
  context: string
  confidence: number // 0-1
  requiresCounselorAlert: boolean
}

export interface SafetyResources {
  title: string
  description: string
  contactInfo: string
  category: 'crisis' | 'mental_health' | 'support' | 'academic'
  available24_7: boolean
}

// Crisis keywords by severity level
const CRISIS_KEYWORDS = {
  T1_IMMINENT: [
    // Suicidal ideation
    'suicidal',
    'suicide',
    'kill myself',
    'take my life',
    'end it',
    'don\'t want to live',
    'shouldn\'t exist',
    'better off dead',
    'goodbye forever',
    'last message',
    'final note',
    'overdose',
    'hanging',
    'jump off',
    'slit wrist',
    'cut myself deep',

    // Active self-harm
    'cutting',
    'self harm',
    'self-harm',
    'hurt myself',
    'scar',
    'bleed',

    // Abuse
    'abusing me',
    'beat me',
    'violent',
    'rape',
    'sexual assault',
    'molestation',
    'trafficking',
    'torture',
    'poison',
  ],

  T2_CONCERNING: [
    // Depression/hopelessness
    'depressed',
    'depression',
    'hopeless',
    'worthless',
    'useless',
    'hate myself',
    'hate my life',
    'no point',
    'why live',
    'empty inside',
    'hollow',
    'numb',
    'dead inside',
    'give up',
    'can\'t go on',

    // Anxiety/panic
    'anxiety attack',
    'panic attack',
    'can\'t breathe',
    'heart racing',
    'breakdown',
    'losing it',
    'falling apart',
    'can\'t function',

    // Isolation/loneliness
    'alone',
    'nobody cares',
    'friendless',
    'outcast',
    'no one understands',
    'isolated',
    'disconnected',
  ],

  T3_MONITORING: [
    // Stress/overwhelm
    'overwhelmed',
    'stressed',
    'stressed out',
    'burnt out',
    'burning out',
    'too much',
    'can\'t handle',
    'breaking down',
    'done',
    'tired',
    'exhausted',
    'can\'t sleep',
    'not sleeping',
    'nightmare',
    'nightmare about school',

    // Academic crisis
    'failing',
    'flunking',
    'drop out',
    'quit school',
    'expulsion',
    'suspended',
    'parents will kill me',
    'ruin my life',
    'all over',
  ],
}

/**
 * Detect crisis keywords in student message
 * Returns severity, keywords found, and confidence score
 */
export function detectCrisisKeywords(message: string): CrisisDetectionResult {
  const lowerMsg = message.toLowerCase()

  // Check T1 (Imminent) - highest priority
  for (const keyword of CRISIS_KEYWORDS.T1_IMMINENT) {
    if (lowerMsg.includes(keyword)) {
      return {
        detected: true,
        severity: 'T1_IMMINENT',
        keywords: [keyword],
        context: 'Potential imminent safety concern',
        confidence: 0.95,
        requiresCounselorAlert: true,
      }
    }
  }

  // Check T2 (Concerning)
  const t2Matches = CRISIS_KEYWORDS.T2_CONCERNING.filter((keyword) =>
    lowerMsg.includes(keyword)
  )
  if (t2Matches.length >= 2) {
    // Multiple concerning keywords = elevated concern
    return {
      detected: true,
      severity: 'T2_CONCERNING',
      keywords: t2Matches,
      context: 'Pattern of concerning language detected',
      confidence: 0.85,
      requiresCounselorAlert: true,
    }
  }
  if (t2Matches.length === 1) {
    return {
      detected: true,
      severity: 'T2_CONCERNING',
      keywords: t2Matches,
      context: 'Single concerning phrase detected',
      confidence: 0.65,
      requiresCounselorAlert: false, // Notify but don't panic alert
    }
  }

  // Check T3 (Monitoring)
  const t3Matches = CRISIS_KEYWORDS.T3_MONITORING.filter((keyword) =>
    lowerMsg.includes(keyword)
  )
  if (t3Matches.length >= 2) {
    return {
      detected: true,
      severity: 'T3_MONITORING',
      keywords: t3Matches,
      context: 'Multiple stress indicators',
      confidence: 0.6,
      requiresCounselorAlert: false,
    }
  }

  return {
    detected: false,
    severity: null,
    keywords: [],
    context: '',
    confidence: 0,
    requiresCounselorAlert: false,
  }
}

/**
 * Build safety-first response based on severity
 * Tone adapted based on student's preference
 */
export function buildCrisisResponse(
  severity: 'T1_IMMINENT' | 'T2_CONCERNING' | 'T3_MONITORING',
  tone: 'straightforward' | 'friendly' | 'supportive' = 'supportive'
): string {
  if (severity === 'T1_IMMINENT') {
    return `I'm really concerned about what you just shared, and I want to make sure you get support **right now**.

**Please reach out to someone immediately:**
🚨 **National Suicide Prevention Lifeline**: 988 (call or text)
🚨 **Crisis Text Line**: Text HOME to 741741
🚨 **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/

If you're in immediate danger, please call 911 or go to your nearest emergency room.

I'm connecting your school counselor right now. They'll follow up with you today.

You matter. This feeling is temporary, but the help you need is available right now. Please reach out. 💙`
  }

  if (severity === 'T2_CONCERNING') {
    const baseResponse =
      tone === 'straightforward'
        ? `I'm picking up on some real pain in what you're saying. This isn't something you should carry alone.`
        : tone === 'friendly'
          ? `Hey, I can tell you're really struggling right now. That matters to me, and you deserve real support.`
          : `I can feel how much you're hurting, and I want you to know: that's valid, and you don't have to go through this alone.`

    return `${baseResponse}

**Let's connect you with someone who can truly help:**
📞 **School Counselor**: Your counselor is trained for exactly this. I'm flagging this conversation for them today.
💙 **Crisis Text Line**: Text HOME to 741741 (free, confidential, 24/7)
🌐 **NAMI Helpline**: 1-800-950-NAMI (experienced peer support)

**In the meantime:**
- Don't isolate—tell someone you trust how you're feeling
- If thoughts get darker, go to 988 or the ER immediately
- You're not broken. You're struggling, and that's fixable.

Morgan is here for the small steps, but a counselor is here for the big ones. Please reach out today.`
  }

  // T3_MONITORING
  const t3Base =
    tone === 'straightforward'
      ? `You sound burnt out. Not broken—just overloaded.`
      : tone === 'friendly'
        ? `I can hear the stress in what you're saying. That's a sign you need a break.`
        : `What you're feeling is real, and it's a signal that you need support.`

  return `${t3Base}

Here's what might help:
✓ **Take a real break** (not scrolling—actually rest)
✓ **Talk to your counselor** about stress management (not crisis, just talking)
✓ **Scale back if possible** (we can adjust your goal timeline)
✓ **Tell someone you trust** how you're feeling

You don't have to push through everything alone. Reaching out for help is strength, not weakness.

If things get darker, use:
💙 Crisis Text Line: Text HOME to 741741
📞 988 (Suicide Prevention Lifeline)`
}

/**
 * Safe resources organized by category
 */
export const SAFETY_RESOURCES: SafetyResources[] = [
  {
    title: '988 Suicide & Crisis Lifeline',
    description: 'Free, confidential, 24/7 support for people in crisis',
    contactInfo: 'Call or text 988 | https://988lifeline.org',
    category: 'crisis',
    available24_7: true,
  },
  {
    title: 'Crisis Text Line',
    description: 'Text-based crisis support (if calling feels unsafe)',
    contactInfo: 'Text HOME to 741741',
    category: 'crisis',
    available24_7: true,
  },
  {
    title: 'NAMI Helpline',
    description: 'Peer-to-peer support from people with lived experience',
    contactInfo: '1-800-950-NAMI | https://www.nami.org/help',
    category: 'mental_health',
    available24_7: false,
  },
  {
    title: 'International Association for Suicide Prevention',
    description: 'Global resources and crisis centers',
    contactInfo: 'https://www.iasp.info/resources/Crisis_Centres/',
    category: 'crisis',
    available24_7: true,
  },
  {
    title: 'SAMHSA National Helpline',
    description: 'Free referral service for mental health and addiction',
    contactInfo: '1-800-662-4357 | https://www.samhsa.gov/find-help/national-helpline',
    category: 'mental_health',
    available24_7: true,
  },
]

/**
 * Get resources for a given severity/category
 */
export function getRelevantResources(severity: string): SafetyResources[] {
  if (severity === 'T1_IMMINENT') {
    return SAFETY_RESOURCES.filter((r) => r.category === 'crisis')
  }
  if (severity === 'T2_CONCERNING') {
    return SAFETY_RESOURCES.filter((r) => r.category === 'crisis' || r.category === 'mental_health')
  }
  return SAFETY_RESOURCES.filter((r) => r.category !== 'crisis')
}
