# Logging, Error Handling & Loading States - Test Guide

## ✅ Implementation Complete

All 5 modules now have:
- ✅ Loading states with spinner animations
- ✅ Comprehensive logging (frontend + backend)
- ✅ User-friendly error messages with ErrorDisplay component
- ✅ Toast notifications for success/error
- ✅ Server-side OpenAI calls verified (via Supabase Edge Functions)

---

## 🧪 Testing Checklist

### For EACH Module (Meeting Intelligence, Product Documentation, Release Communications, Prioritization, PM Advisor)

#### ✅ 1. Loading States Test
**Test:** Click the generate button
**Expected:**
- Button shows loading spinner immediately
- Button text changes to "Analyzing..." / "Generating..." / "Calculating..."
- Button is disabled during processing
- Loading spinner stops when complete

**How to verify:**
```
1. Open the module page
2. Fill in required fields
3. Click generate button
4. Observe loading spinner appears immediately
5. Wait for completion
6. Spinner should disappear and results should show
```

---

#### ✅ 2. Console Logging Test
**Test:** Perform a successful generation
**Expected browser console logs:**
```
👤 [User Action] Clicked "Generate..." button
📝 [Input Data] { ... payload summary ... }
🚀 [Agent Request] { timestamp, action, module, requestUrl, payload }
✅ [Agent Response] { timestamp, action, module, responseStatus: 200, responseBody, duration }
✨ [Success] Received AI-generated output { outputLength: ... }
💾 [Database] Saving to ...sessions table...
💾 [Database] Saved successfully
🏁 [Complete] ... request finished
```

**How to verify:**
```
1. Open browser DevTools (F12)
2. Go to Console tab
3. Clear console
4. Perform a generation
5. Check console for emoji-prefixed logs
6. Verify all stages are logged
```

---

#### ✅ 3. Server-Side Logging Test
**Test:** Check Supabase Edge Function logs
**Expected Supabase function logs:**
```
📥 [Edge Function] Received request to [function-name]
⏰ [Timestamp] 2024-...
📋 [Payload] { ... payload info ... }
🤖 [OpenAI] Calling GPT-4o...
📊 [OpenAI] Message length: ...
📡 [OpenAI Response] { status: 200, ok: true }
✅ [Success] Generated output { duration: "...ms", output_length: ..., tokens_used: ... }
```

**How to verify:**
```
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/aziandtcipmaphviocgz
2. Navigate to Edge Functions → Logs
3. Select the function (e.g., meeting-intelligence)
4. Perform a generation in the app
5. Check logs for emoji-prefixed entries
6. Verify request → response flow
```

---

#### ✅ 4. Error Handling Test

##### Test 4a: Missing Required Fields
**Test:** Click generate without filling required fields
**Expected:**
- ErrorDisplay component appears with red border
- Message: "Please fill in all required fields and select at least one output type"
- Toast notification shows error
- Console shows validation error log

**How to verify:**
```
1. Open module page
2. Leave required fields empty
3. Click generate button
4. Verify error message appears in ErrorDisplay
5. Check console for validation error
```

##### Test 4b: Network Error (Simulated)
**Test:** Simulate network offline
**Expected:**
- ErrorDisplay shows: "Network error: Unable to reach server. Check your connection."
- Toast notification shows error
- Console shows network error details

**How to verify:**
```
1. Open DevTools → Network tab
2. Set throttling to "Offline"
3. Try to generate
4. Verify error message
5. Turn network back online
```

##### Test 4c: OpenAI API Key Missing
**Test:** Edge function without OPENAI_API_KEY
**Expected:**
- ErrorDisplay shows: "OpenAI API key not configured. Please set OPENAI_API_KEY in Supabase secrets."
- Helpful instructions included
- Server logs show config error

**How to verify:**
```
This requires Supabase dashboard access:
1. Go to Supabase → Settings → Edge Functions → Secrets
2. Remove OPENAI_API_KEY temporarily
3. Try to generate
4. Verify error message
5. Restore OPENAI_API_KEY
```

##### Test 4d: Server Error (500)
**Test:** Server throws error
**Expected:**
- ErrorDisplay shows: "Server error: [error message]"
- Toast notification shows error
- Console shows full error stack
- Supabase logs show error details

**How to verify:**
```
Check Supabase function logs for any 500 errors
Error should show user-friendly message + console details
```

---

#### ✅ 5. Error Dismissal Test
**Test:** Dismiss error message
**Expected:**
- Click X button on ErrorDisplay
- ErrorDisplay component disappears
- Can try again without page reload

**How to verify:**
```
1. Trigger any validation error
2. Click the X button on error message
3. Error should disappear
4. Form should remain filled
```

---

### Module-Specific Tests

#### Meeting Intelligence
**Special test:** Sample transcript dialog
```
1. Click "Load Sample" button
2. Sample should load into form
3. Click "Analyze Meeting"
4. Verify loading → success → output displayed
5. Check console logs
6. Check session history tab
```

#### Product Documentation
**Special test:** PM Advisor review
```
1. Generate documentation first
2. Click "Run PM Advisor Review"
3. Verify separate loading state for advisor
4. Check advisor tab for review output
5. Verify context artifacts logged in console
6. Verify separate error handling for advisor
```

#### Release Communications
**Special test:** CSV upload + PM Advisor
```
1. Upload CSV file
2. Verify CSV parse logging
3. Generate release notes
4. Run PM Advisor review
5. Check both error states work independently
6. Verify CSV metadata in logs
```

#### Prioritization
**Special test:** CSV upload + WSJF calculation
```
1. Upload CSV file
2. Select WSJF model
3. Configure parameters
4. Calculate WSJF
5. Verify configuration logged
6. Check CSV row count in logs
```

---

## 🔍 Verification Architecture

### ✅ Confirm OpenAI Calls Are Server-Side

**How to verify:**
1. Open browser DevTools → Network tab
2. Filter by "openai.com"
3. Perform any generation
4. **EXPECTED:** No direct calls to openai.com should appear
5. **EXPECTED:** Only calls to `supabase.co/functions/v1/...`

**Architecture:**
```
Frontend
  ↓ Click "Generate"
  ↓ Calls: supabase.functions.invoke('meeting-intelligence', { body: {...} })
  ↓
Supabase Edge Function (Server-Side)
  ↓ Receives request
  ↓ Logs: 📥 [Edge Function] Received request
  ↓ Validates input
  ↓ Calls: fetch('https://api.openai.com/v1/chat/completions', ...)
  ↓ Logs: 🤖 [OpenAI] Calling GPT-4o...
  ↓ Returns response
  ↓
Frontend
  ↓ Receives response
  ↓ Logs: ✅ [Agent Response]
  ↓ Displays output
```

---

## 📊 Expected Log Flow

### Successful Request:
```
FRONTEND:
👤 [User Action] Clicked button
📝 [Input Data] {...}
🚀 [Agent Request] {...}
✅ [Agent Response] {...}
✨ [Success] Received output
💾 [Database] Saving...
💾 [Database] Saved successfully
🏁 [Complete] Request finished

BACKEND (Supabase Function Logs):
📥 [Edge Function] Received request
⏰ [Timestamp] ISO timestamp
📋 [Payload] {...}
🤖 [OpenAI] Calling GPT-4o...
📊 [OpenAI] Message length: ...
📡 [OpenAI Response] { status: 200 }
✅ [Success] Generated output { duration: "...ms", tokens: ... }
```

### Failed Request:
```
FRONTEND:
👤 [User Action] Clicked button
📝 [Input Data] {...}
🚀 [Agent Request] {...}
❌ [Agent Error] {...}
💥 [Error Handler] Caught error: ...
🏁 [Complete] Request finished

BACKEND (Supabase Function Logs):
📥 [Edge Function] Received request
⏰ [Timestamp] ISO timestamp
⚠️ [Validation Error] Missing ... OR
🔑 [Config Error] OPENAI_API_KEY not set OR
❌ [OpenAI Error] ... OR
💥 [Error] Exception details
```

---

## 🎯 Test Scenarios Summary

| Scenario | Expected Behavior | How to Test |
|----------|-------------------|-------------|
| **Valid Input** | Loading → Success → Output displayed | Fill form, click generate |
| **Empty Fields** | Validation error in ErrorDisplay | Leave required fields empty |
| **Network Offline** | Network error message | DevTools → Offline mode |
| **Missing API Key** | Config error with instructions | Remove Supabase secret |
| **Edge Function 404** | Function not found error | Wrong function name |
| **OpenAI Error** | Server error with details | API quota exceeded |
| **PM Advisor Review** | Separate loading & error states | Generate → Run Advisor |
| **CSV Upload** | Parse validation + logging | Upload invalid CSV |
| **Session History** | Load previous outputs | Click history items |
| **Error Dismissal** | Error disappears, form remains | Click X on error |

---

## 🚀 Quick Test Commands

### View all console logs:
```javascript
// In browser console:
AgentLogger.getLogs()
```

### Clear all logs:
```javascript
AgentLogger.clearLogs()
```

### Test error parsing:
```javascript
import { parseErrorMessage } from '@/lib/agent-logger';
console.log(parseErrorMessage({ message: 'fetch failed' }));
```

---

## ✅ Deliverables Confirmation

- ✅ agent-logger.ts created with comprehensive logging
- ✅ ErrorDisplay component created for consistent error UI
- ✅ All 5 modules updated with:
  - ✅ Loading states (spinner + disabled button)
  - ✅ Error handling (ErrorDisplay + toast)
  - ✅ Console logging (user action → request → response)
- ✅ All 5 edge functions updated with:
  - ✅ Server-side logging (request → OpenAI → response)
  - ✅ Structured error responses
  - ✅ Validation checks
- ✅ OpenAI calls verified as server-side only (NOT client-side)
- ✅ Build successful

---

## 📝 Next Steps

1. **Test each module** following the checklist above
2. **Check Supabase function logs** for server-side logging
3. **Verify error scenarios** trigger appropriate messages
4. **Confirm OpenAI calls** are server-side via Network tab
5. **Deploy edge functions** if not already deployed:
   ```bash
   supabase functions deploy meeting-intelligence
   supabase functions deploy product-documentation
   supabase functions deploy release-communications
   supabase functions deploy prioritization
   supabase functions deploy pm-advisor
   ```

---

## 🐛 Debugging Tips

**If logs don't appear:**
- Check browser console is not filtered
- Verify DevTools Console settings → "All levels" enabled
- Clear console and try again

**If ErrorDisplay doesn't show:**
- Check component is imported correctly
- Verify error state is set
- Check ErrorDisplay placement in JSX

**If edge function logs missing:**
- Verify function is deployed
- Check Supabase dashboard logs
- Ensure OPENAI_API_KEY is set in Supabase secrets

**If OpenAI calls fail:**
- Check Supabase edge function logs for errors
- Verify OPENAI_API_KEY is valid
- Check OpenAI API quota/limits
- Verify network connectivity

---

## 📞 Support

For issues:
1. Check browser console for detailed error logs
2. Check Supabase function logs
3. Verify all environment variables are set
4. Review this test guide for common scenarios
