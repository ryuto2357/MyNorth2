# Frontend Testing Quick Reference

## Start the Dev Server
```bash
npm run dev
```
Then open http://localhost:3000

---

## TEST 1: Onboarding (5 min)

### Steps
1. Go to `/auth/signup` → Create test account
2. Complete all 9 onboarding questions
3. Select tone: **"friendly"** (for testing context)

### What to Verify
- ✅ Each step shows progress bar
- ✅ Can't skip required fields
- ✅ After submit: redirects to `/app`
- ✅ Dashboard shows goal card

### DB Check (Optional)
```sql
SELECT tone_preference FROM users WHERE email='your_test_email';
-- Should be: friendly
```

---

## TEST 2: Task Generation (10 min)

### Steps
1. Dashboard → Click "Today's Tasks"
2. Click "Generate My Tasks"
3. Wait for generation (~5 sec)

### Network Tab (Chrome DevTools → Network)
Watch for these calls in order:
- ✅ `POST /api/tasks/generate`
- ✅ `POST /api/workload/calculate` (internally)
- ✅ `POST /api/constellation/generate` (if first time)
- ✅ `POST` to Gemini API

### What to Expect
- Task count should be between 3-11 (NOT always 14)
- Duration should match workload budget
- Tasks grouped by today + future days
- Each has checkbox + "Skip" option

---

## TEST 3: Multi-Goal Conflict (15 min)

### Steps
1. Dashboard → Click "+ Add Goal"
2. Add goal: Title="Learn Python", Deadline=60 days
3. Note: Now showing 2 goals as tabs

### To See Conflict
1. Go to "Goal 2: Learn Python"
2. Click "Today's Tasks" → "Generate My Tasks"

### Network Tab
- Should call `POST /api/goals/arbitrate`
- Returns: allocation percentages for each goal

### What to See
- ✅ Fewer tasks for Goal 2 than Goal 1 (allocated budget)
- ✅ Warning message: "⚠️ MULTI-GOAL MODE"
- ✅ Shows time allocation breakdown

---

## TEST 4: Morgan with Context (15 min)

### Steps
1. Dashboard → "Talk to Morgan"
2. Send: "I have two goals now, am I crazy?"

### What to Look For in Response
- Morgan should mention **both** goals
- Should reference your **tone** preference
- Should include your **free time** context
- Should mention **streak/completion** if any

### Bad Signs (Means Corpus Not Used)
- Generic greeting like "Hi, what's your goal?"
- No mention of your context
- System prompt looks legacy/simple

---

## TEST 5: Crisis Detection (5 min)

### Safe Test (Use Test Endpoint)
```bash
# Open terminal in project root, run:
curl -X POST http://localhost:3000/api/crisis/test \
  -H "Content-Type: application/json" \
  -d '{"message": "I am thinking of ending my life", "tone": "supportive"}'
```

### Expected Response
```json
{
  "detection": {
    "detected": true,
    "severity": "T1_IMMINENT",
    "confidence": 0.95,
    "keywords": ["ending my life", "life"]
  },
  "response": "[Full crisis response with 988 number...]"
}
```

### In Chrome (Don't do in real app, TEST ENDPOINT ONLY)
- Open Morgan chat
- Message: "I'm feeling depressed about failing"
- Should see: Crisis response + mental health resources
- **NOT** a normal Morgan response

---

## TEST 6: Node Tracking (5 min)

### Steps
1. Dashboard → "View Constellation"
2. Click on any node
3. Should see details panel open

### Behind the Scenes
- When you click, `POST /api/nodes/track-access` called
- Updates `last_accessed_at` in database

### DB Check
```sql
SELECT label, last_accessed_at FROM nodes
WHERE id='[the node you clicked]'
-- Should have recent timestamp
```

---

## TEST 7: Task Completion (10 min)

### Steps
1. Go to Tasks page
2. Mark 5 tasks as COMPLETED ✓
3. Note the counter: "5/7 completed today"

### Behind Scenes
- Each check calls: `PATCH /api/tasks/[id]`
- Should set `completed_at` timestamp
- Should recalculate completion_rate_history

### DB Check
```sql
SELECT COUNT(*) FROM tasks
WHERE goal_id='[goal]' AND status='COMPLETED'
-- Should match what you checked

SELECT completion_rate_history FROM goals
WHERE id='[goal]'
-- Should be ~0.71 (5/7 completed)
```

---

## Troubleshooting Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Tasks always 14 | Network tab: is workload endpoint called? | Verify `/api/workload/calculate` is in chain |
| Morgan generic | Response mentions context? | Check if corpus endpoint called first |
| No multi-goal warning | Do you have 2 ACTIVE goals? | Add second goal, generate new tasks |
| Crisis response wrong | Check tone_preference value | Make sure onboarding saved correct tone |
| Node panel won't open | Console errors? | Check ConstellationGraph component import |
| Tasks not updating | Did you click checkbox? | Check network tab for PATCH request |

---

## Console Commands (DevTools)

```javascript
// Check if user_corpus exists
fetch('/api/user-corpus').then(r=>r.json()).then(d=>console.log(d))

// Manually test workload (get current user ID first)
fetch('/api/workload/calculate', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({goalId: '[goalId]', userId: '[userId]'})
}).then(r=>r.json()).then(d=>console.log(d))

// Check current session
localStorage.getItem('supabase.auth.token')
```

---

## Success Indicators

✅ **System is working correctly if**:
1. Onboarding saves to DB (tone_preference exists)
2. Task count varies by goal/deadline (not always 14)
3. Morgan mentions multi-goal context
4. Crisis keywords trigger proper responses
5. Tasks marked complete update rate
6. Node clicks update last_accessed_at

🔴 **System has issues if**:
1. Tasks always 14 regardless of workload
2. Morgan always generic (no context)
3. Multi-goal doesn't show warning
4. Completion rate never changes
5. Build fails with errors

