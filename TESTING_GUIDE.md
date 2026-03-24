# Frontend End-to-End Testing Guide

## Test Scenario 1: Complete Onboarding → First Task Generation

### Step 1.1: Sign Up & Create Account
- Go to `/auth/signup`
- Enter: Email, Password
- **Expected**: Account created, redirected to `/app/app/onboarding`

### Step 1.2: Onboarding Flow
- **Question 1 - Name**: "Alex" → Continue
- **Question 2 - Age & School**: "17, Bandung Senior High" → Continue
- **Question 3 - Goal**: "Get 900 on SNBT (SAT equivalent)" → Continue
- **Question 4 - Why**: "I want to study abroad at NUS" → Continue
- **Question 5 - Deadline**: Pick date 120 days from now → Continue
- **Question 6 - Familiarity**: Slide to 4/10 → Continue
- **Question 7 - Free Time**: "2.5" hours/day → Continue
- **Question 8 - Completion Rate**: "50%" (be honest) → Continue
- **Question 9 - Tone**: Select "friendly" → Continue/Submit

**Check in DB**:
```sql
SELECT * FROM users WHERE email='test@example.com';
-- Should have: name='Alex', tone_preference='friendly', onboarding_complete=true

SELECT * FROM goals WHERE user_id=[userId];
-- Should have: 1 goal, title='Get 900 on SNBT', priority_rank=1

SELECT * FROM user_corpus WHERE user_id=[userId];
-- Should have: Full corpus structure with identity, schedule, goals, preferences
```

**Expected Frontend**:
- ✅ Each step shows progress (e.g., "Step 1/9")
- ✅ Can go back/forward
- ✅ Form validation (no missing fields)
- ✅ Success message after submit
- ✅ Redirect to `/app/app` (dashboard)

---

### Step 1.3: Dashboard Load
- **Expected**: Shows "Welcome back, Alex!"
- **Expected**: Shows goal card with:
  - Title: "Get 900 on SNBT"
  - Priority 1 badge
  - Days Remaining: ~120
  - Familiarity: 4/10
  - Status: Active ✓
- **Expected**: Three action cards:
  - 🤖 Talk to Morgan
  - ✨ View Constellation
  - ✓ Today's Tasks

---

### Step 1.4: Generate First Tasks
- Click "Today's Tasks" → Go to `/app/tasks`
- **Expected**: Empty state with "Generate My Tasks" button
- Click "Generate My Tasks"

**In Console (DevTools)**:
```javascript
// Watch network tab for these calls in order:
1. POST /api/tasks/generate { goalId, userId }
   ↓ (internally calls)
2. POST /api/workload/calculate { goalId, userId }
   Returns: { daily_budget_minutes: 150, task_count: 7, in_crunch_mode: false, ... }
3. POST /api/constellation/generate (if constellation missing)
   Returns: nodes + links
4. (Gemini call with task prompt using task_count=7, duration=~21min each)
```

**Expected Response**:
```json
{
  "success": true,
  "taskCount": 7,
  "dailyBudget": 150,
  "minutesPerTask": 21,
  "inCrunchMode": false,
  "workloadData": {
    "H_remaining": 40,
    "D_effective": 120,
    "I_total": 0.45,
    "L_daily": 2.5,
    ...
  }
}
```

**Expected UI**:
- ✅ Shows 7 tasks for today (or 7+ total if spanning multiple days)
- ✅ Each task shows:
  - Duration (e.g., "21 min")
  - Scheduled time (09:00, 14:00, 19:00 rotation)
  - Checkbox to mark complete
  - Description

**Check DB**:
```sql
SELECT * FROM tasks WHERE goal_id=[goalId] AND scheduled_for=CURRENT_DATE;
-- Should have 7 tasks with status='PENDING', duration=21min
```

---

## Test Scenario 2: Multi-Goal Conflicts

### Step 2.1: Add Second Goal
- From dashboard, click "+ Add Goal"
- Enter:
  - Title: "Learn Python"
  - Why: "For university CS program"
  - Deadline: 60 days from now
  - Familiarity: 2/10
- Click Create

**Expected**:
- ✅ New goal created with priority_rank=2
- ✅ Redirect to dashboard
- ✅ Dashboard now shows BOTH goals as tabs

---

### Step 2.2: Generate Tasks for Second Goal
- Click "Goal 2: Learn Python" tab
- Click "Today's Tasks"
- Click "Generate My Tasks"

**In Network Tab**:
```javascript
POST /api/goals/arbitrate { userId }
Returns: {
  hasConflict: true,
  conflictDescription: "Combined load is 5.2h/day, but you have 2.5h free",
  allocations: [
    { goalId: goal1, original_daily_budget_min: 150, allocated_daily_budget_min: 90, weight: 0.55 },
    { goalId: goal2, original_daily_budget_min: 150, allocated_daily_budget_min: 60, weight: 0.3 }
  ]
}
```

**Expected Task Response**:
```json
{
  "taskCount": 3,
  "dailyBudget": 60,
  "inCrunchMode": false
}
```

**Expected UI**:
- ✅ Shows conflict warning: "⚠️ MULTI-GOAL MODE: You have 2 active goals..."
- ✅ Only 3 tasks generated (not 7) due to allocated budget
- ✅ Task durations are 20min each (60 min total)

---

## Test Scenario 3: Morgan Context Injection

### Step 3.1: Chat with Morgan
- Click "Talk to Morgan"
- Send message: "I'm feeling overwhelmed by these two goals"

**In Network Tab**:
```javascript
POST /api/chat { userId, goalId, message, sessionId }

Before calling Gemini, should:
1. Call GET /api/user-corpus { userId }
   Returns full corpus with identity, schedule, goals, preferences, metadata
2. Call buildMorganSystemPromptFromCorpus(corpus)
3. Build rich system prompt including:
   - "You have 2 active goals: Get 900 on SNBT (90d, 50% on-track), Learn Python (60d, 0% on-track)"
   - "Streak: 0 days, but you just completed onboarding!"
   - "Tone: friendly"
```

**Expected Morgan Response** (should reference context):
```
"Hey Alex! I can see you're balancing SNBT prep AND Python at the same time.
That's ambitious, and I hear you on the overwhelm.

Here's the good news: We've already split your time smart.
Goal 1 gets 90 min/day, Goal 2 gets 60 min/day. That's 2.5 hours total—doable.

What feels scariest right now: the SNBT material or the Python learning curve?"
```

**NOT Expected** (would indicate corpus not being used):
```
"Ok, what's your goal?"
(generic response, missing context)
```

---

## Test Scenario 4: Crisis Detection

### Step 4.1: Trigger T3_MONITORING
- Send message: "I'm so burnt out and exhausted from studying"

**Expected**:
- Morgan responds with supportive message + suggestions for break
- Behind scenes: detectCrisisKeywords() returns severity: null (or T3 without alert)
- No counselor alert sent
- Response saved to chat

---

### Step 4.2: Trigger T2_CONCERNING
- Send message: "I hate myself, I'm so depressed about failing my tests"

**Expected**:
- Morgan responds with mental health support + crisis resources
- Behind scenes: Alert sent to `/api/crisis/alert` with severity T2_CONCERNING
- No immediate caller blocking (continues normally)
- If in counselor system: Alert appears in `/api/crisis/dashboard`

---

### Step 4.3: Trigger T1_IMMINENT (Testing Only)
- **Option A**: Use test endpoint:
  ```bash
  curl -X POST http://localhost:3000/api/crisis/test \
    -H "Content-Type: application/json" \
    -d '{"message": "I am thinking of ending my life", "tone": "supportive"}'
  ```

- **Expected Response**:
  ```json
  {
    "detection": {
      "detected": true,
      "severity": "T1_IMMINENT",
      "confidence": 0.95
    },
    "response": "[Contact 988... full safety resources]"
  }
  ```

---

## Test Scenario 5: Constellation Node Tracking

### Step 5.1: View Constellation
- Go to `/app/constellation`

**Expected**:
- ✅ D3 force graph displays
- ✅ Shows nodes for goal (ROOT, ACHIEVEMENT nodes, SKILL nodes)
- ✅ Links show relationships
- ✅ Node details panel can open

### Step 5.2: Click Node & Track Access
- Click on a node (e.g., "English Reading Comprehension")

**Behind Scenes**:
```javascript
// Frontend calls asynchronously (non-blocking):
POST /api/nodes/track-access { nodeId }
```

**Check DB**:
```sql
SELECT last_accessed_at FROM nodes WHERE id=[nodeId];
-- Should be NOW() (within last few seconds)
```

**Expected**:
- ✅ Panel opens showing node details
- ✅ Can see description, familiarity score
- ✅ Can edit (optional - if endpoint built)

---

## Test Scenario 6: Task Completion & Rate Tracking

### Step 6.1: Complete Tasks
- Go to `/app/tasks`
- Mark 5 out of 7 tasks as COMPLETED today

**In Network Tab**:
```javascript
PATCH /api/tasks/[taskId] { status: 'COMPLETED' }

Behind scenes should:
1. Set completed_at = NOW()
2. Call completion-rate calculation
3. Update goals.completion_rate_history
4. Invalidate user_corpus cache
```

**Check DB**:
```sql
SELECT COUNT(*) as completed_today FROM tasks
WHERE goal_id=[goalId] AND scheduled_for=CURRENT_DATE AND status='COMPLETED';
-- Should be 5

SELECT completed_at FROM tasks WHERE id=[taskId];
-- Should have timestamp

SELECT completion_rate_history FROM goals WHERE id=[goalId];
-- Should reflect today's completion (5/7 = 71%)
```

---

### Step 6.2: Generate Tasks Tomorrow (New Rate Used)
- Next day, generate new tasks
- Check workload calculation

**Expected**:
- I_total should be recalculated with new H_history (based on completion rate)
- If 71% completing, H_history should be lower (~0.05 instead of 0.2)
- New daily budget might be slightly lower/higher depending on formula
- This = **self-correcting system!**

---

## Test Scenario 7: Hard Day Protocol

### Step 7.1: Trigger Hard Day
- From tasks page, look for "Hard Day" button (if implemented)
- Or: Send to Morgan: "I'm having a really hard day, can we do something small?"

**Expected**:
```json
POST /api/tasks/hard-day { goalId, userId }

Response: {
  "success": true,
  "task": {
    "title": "Just 15 minutes: Review one concept",
    "duration_minutes": 10,
    "motivation": "You're doing great. Today is just about showing up."
  }
}
```

**Expected UI**:
- ✅ Shows single 10-15 min task
- ✅ Compassionate wording
- ✅ Encouragement message

---

## Manual Checklist

- [ ] **Onboarding**: Full flow works, creates user + goal + corpus
- [ ] **Dashboard**: Shows all goals, multi-goal tabs work
- [ ] **Workload Engine**: Task count changes based on free time/deadline
- [ ] **Task Generation**: Uses workload constraints, not hardcoded 14
- [ ] **Multi-Goal**: Conflict detected, budget allocated, displayed
- [ ] **Morgan Context**: References student context in responses
- [ ] **Morgan Tone**: Changes based on user preference
- [ ] **Crisis T1**: Returns resources correctly
- [ ] **Crisis T2**: Returns alert + resources
- [ ] **Crisis T3**: Logged correctly
- [ ] **Constellation**: Displays nodes + links
- [ ] **Node Tracking**: last_accessed_at updates on click
- [ ] **Task Completion**: completed_at sets, rate updates
- [ ] **Completion Rate**: Displayed on dashboard
- [ ] **Corpus Cache**: Invalidates when tasks change
- [ ] **Hard Day**: Button/option exists and works

---

## Common Issues to Watch For

| Issue | Debug | Fix |
|-------|-------|-----|
| Tasks always 14 | Check `/api/tasks/generate` workload call | Verify workload endpoint called BEFORE Gemini |
| Morgan generic | Check system prompt origin | Use `getUserCorpus()` before `buildMorganSystemPrompt()` |
| No crisis alert logged | Check `/api/crisis/alert` call | Verify fetch URL is correct |
| Multi-goal not shown | Check goals query `.eq('status', 'ACTIVE')` | Verify both goals saved as ACTIVE |
| Tone not changing | Check if `tone_preference` saved in onboarding | Add tone question to form |
| Completion rate stuck | Check if `completed_at` being set | Update PATCH `/api/tasks/[id]` |
| Corpus not building | Check `POST /api/user-corpus` response | Verify all DB queries in corpus builder |

---

## Load Testing (Optional)

```bash
# Generate 100 tasks (stressing task generation)
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/tasks/generate \
    -H "Content-Type: application/json" \
    -d '{"goalId": "...", "userId": "..."}'
  sleep 1
done

# Watch for:
- Workload engine response time (should be <200ms)
- Gemini latency (typically 2-5s)
- Database connection pool issues
```

