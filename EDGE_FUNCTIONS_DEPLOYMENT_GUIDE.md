# Supabase Edge Functions Deployment Guide

## ✅ Completed Steps

### 1. Edge Functions Created
All 5 Supabase Edge Functions have been created in the `supabase/functions/` directory:

- ✅ `meeting-intelligence/index.ts` - Meeting analysis and action item extraction
- ✅ `product-documentation/index.ts` - PRD, user stories, and epic generation
- ✅ `release-communications/index.ts` - Release notes and stakeholder updates
- ✅ `prioritization/index.ts` - WSJF calculation and backlog prioritization
- ✅ `pm-advisor/index.ts` - Artifact review and consistency checking

### 2. Frontend Agent Helpers Updated
All agent helper files have been updated to call Supabase Edge Functions:

- ✅ `src/lib/agent.ts` - Meeting intelligence helper
- ✅ `src/lib/documentation-agent.ts` - Documentation generation helper
- ✅ `src/lib/release-agent.ts` - Release communications helper
- ✅ `src/lib/prioritization-agent.ts` - WSJF prioritization helper
- ✅ `src/lib/pm-advisor.ts` - PM Advisor helper

### 3. Configuration Files
- ✅ `supabase/config.toml` - Supabase configuration
- ✅ `deploy-functions.sh` - Deployment script (for reference)

---

## 🚀 Deployment Instructions

### Option 1: Deploy via Supabase CLI (Recommended)

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link to Altan Cloud project:**
   ```bash
   supabase link --project-ref 9ac0aa46-7dc2-42d2-9498-7ea7b790f287
   ```

4. **Deploy all edge functions:**
   ```bash
   supabase functions deploy meeting-intelligence
   supabase functions deploy product-documentation
   supabase functions deploy release-communications
   supabase functions deploy prioritization
   supabase functions deploy pm-advisor
   ```

### Option 2: Deploy via Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Edge Functions** section
4. Upload each function manually from the `supabase/functions/` directory

---

## 🔐 Configure OpenAI API Key

**CRITICAL:** Edge functions require the OpenAI API key to be set as a Supabase secret.

### Set the secret:

```bash
supabase secrets set OPENAI_API_KEY=your-openai-api-key-here
```

Or via Supabase Dashboard:
1. Go to **Project Settings**
2. Navigate to **Edge Functions** → **Secrets**
3. Add secret:
   - Name: `OPENAI_API_KEY`
   - Value: Your OpenAI API key (starts with `sk-...`)

---

## 🧪 Testing the Functions

### Test each function endpoint:

#### 1. Meeting Intelligence
```bash
curl -X POST \
  https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai/functions/v1/meeting-intelligence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "meeting_transcript": "Test meeting about project planning...",
    "meeting_type": "Planning"
  }'
```

#### 2. Product Documentation
```bash
curl -X POST \
  https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai/functions/v1/product-documentation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "problem_statement": "Test problem",
    "target_user_persona": "Test user",
    "business_goals": "Test goals",
    "assumptions_constraints": "Test constraints",
    "functional_requirements": "Test requirements",
    "dependencies": "None",
    "selected_outputs": ["PRD"]
  }'
```

#### 3. Release Communications
```bash
curl -X POST \
  https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai/functions/v1/release-communications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "csv_data": "Issue Key,Summary,Status\nPM-1,Feature A,Done",
    "selected_outputs": ["Release Notes"]
  }'
```

#### 4. Prioritization
```bash
curl -X POST \
  https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai/functions/v1/prioritization \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "csv_content": "Issue Key,Summary,Story Points\nPM-1,Feature A,5",
    "effort_field_name": "Story Points",
    "max_score_per_factor": 10,
    "normalize_scores": true,
    "selected_outputs": ["Full WSJF Table"]
  }'
```

#### 5. PM Advisor
```bash
curl -X POST \
  https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai/functions/v1/pm-advisor \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "artifact_output": "Test PRD content...",
    "module_type": "product_documentation",
    "project_name": "Test Project",
    "artifact_type": "PRD",
    "context_artifacts": {}
  }'
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] All 5 edge functions deployed successfully
- [ ] `OPENAI_API_KEY` secret is set in Supabase
- [ ] Test each function with sample data
- [ ] Check browser Network tab - functions are called when clicking "Generate"
- [ ] Verify OpenAI API usage in OpenAI dashboard
- [ ] Confirm AI output appears in UI
- [ ] Verify data saves to database correctly
- [ ] No errors in browser console

---

## 🐛 Troubleshooting

### Function returns 401/403 error
- Check that OPENAI_API_KEY is set correctly
- Verify the API key is valid in your OpenAI account

### Function returns 500 error
- Check Supabase logs for detailed error messages
- Verify OpenAI API key has sufficient credits
- Check rate limits on OpenAI account

### Frontend can't call functions
- Verify CORS headers are set correctly
- Check that supabase client is initialized properly
- Verify the Cloud URL in `src/lib/supabase.ts`

### No AI output generated
- Check browser console for errors
- Verify function is called (Network tab)
- Check Supabase function logs
- Verify OpenAI API key is working

---

## 📊 Architecture Overview

```
Frontend (React)
    ↓
Supabase Client (supabase.functions.invoke)
    ↓
Supabase Edge Function (Deno)
    ↓
OpenAI API (GPT-4o)
    ↓
Response back to Frontend
    ↓
Save to Database
```

---

## 📝 Next Steps

1. Deploy all 5 edge functions using the Supabase CLI
2. Set the OPENAI_API_KEY secret
3. Test each function endpoint
4. Verify in the UI that all "Generate" buttons work
5. Check OpenAI usage dashboard to confirm API calls
6. Celebrate! 🎉

---

## 🔗 Useful Links

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [OpenAI API Dashboard](https://platform.openai.com/usage)
- Cloud URL: `https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai`
