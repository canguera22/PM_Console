# Supabase Configuration Setup

## ✅ Configuration Updated

The application has been successfully updated to point to your Supabase project where the edge functions are deployed.

**Your Supabase Project:**
- Project Reference: `aziandtcipmaphviocgz`
- Supabase URL: `https://aziandtcipmaphviocgz.supabase.co`
- Edge Functions Base URL: `https://aziandtcipmaphviocgz.supabase.co/functions/v1/`

---

## 🔧 Required: Set Your Anon Public Key

### Step 1: Get Your Anon Public Key

1. Go to your Supabase project dashboard:
   ```
   https://supabase.com/dashboard/project/aziandtcipmaphviocgz/settings/api
   ```

2. Under **Project API keys**, copy the **`anon` `public`** key

### Step 2: Update Environment Variable

Open the `.env` file in the project root and replace the placeholder:

```bash
VITE_SUPABASE_ANON_KEY=your_actual_anon_public_key_here
```

---

## 📋 Database Tables Required

The application expects the following tables in your Supabase database:

- `projects` - Store project information
- `meeting_sessions` - Store meeting intelligence outputs
- `documentation_sessions` - Store product documentation outputs
- `release_sessions` - Store release communications outputs
- `prioritization_sessions` - Store WSJF prioritization outputs
- `advisor_sessions` - Store PM advisor review outputs

### Check if Tables Exist

1. Go to your Supabase dashboard:
   ```
   https://supabase.com/dashboard/project/aziandtcipmaphviocgz/editor
   ```

2. Look for the tables listed above in the left sidebar

### If Tables Don't Exist

You'll need to create them. Check if there are migration files in the project:

```bash
ls -la supabase/migrations/
```

If migration files exist, you can apply them using the Supabase CLI or SQL editor in the dashboard.

---

## 🧪 Testing Checklist

After setting your anon key, rebuild and test:

### 1. Rebuild the Application

```bash
npm install
npm run build
npm run dev
```

### 2. Test Each Module

Open the application and test all 5 modules:

1. **Meeting Intelligence** - Process a meeting transcript
2. **Product Documentation** - Generate product docs
3. **Release Communications** - Create release notes
4. **WSJF Prioritization** - Calculate prioritization scores
5. **PM Advisor** - Get feedback on artifacts

### 3. Verify Network Requests

Open browser DevTools (F12) → Network tab:

**✅ All requests should go to:**
```
https://aziandtcipmaphviocgz.supabase.co/functions/v1/*
```

**❌ No requests should go to:**
```
https://9ac0aa46-7dc.db-pool-europe-west1.altan.ai
```

---

## 🔍 Files Updated

The following files were updated to use your Supabase project:

1. ✅ `src/lib/supabase.ts` - Updated Supabase URL and client configuration
2. ✅ `.env` - Created with your Supabase URL (anon key needs to be set)
3. ✅ `.env.example` - Template for environment variables
4. ✅ `supabase/config.toml` - Updated project reference for local development

---

## 📡 Edge Functions Already Deployed

You've already deployed all 5 edge functions to your Supabase project:

1. ✅ `meeting-intelligence`
2. ✅ `product-documentation`
3. ✅ `release-communications`
4. ✅ `prioritization`
5. ✅ `pm-advisor`

All agent helper files (`src/lib/*.ts`) are already configured to call these edge functions via `supabase.functions.invoke()`, which will automatically use the new URL.

---

## 🔐 OpenAI API Key

You've already set the `OPENAI_API_KEY` secret in your Supabase project, which is used by all edge functions.

To verify or update:

```bash
# List secrets
supabase secrets list --project-ref aziandtcipmaphviocgz

# Update if needed
supabase secrets set OPENAI_API_KEY=your_openai_api_key --project-ref aziandtcipmaphviocgz
```

---

## 🚀 Quick Start

1. Get anon public key from dashboard
2. Set `VITE_SUPABASE_ANON_KEY` in `.env`
3. Run `npm run dev`
4. Test all modules
5. Verify network requests go to your Supabase project

---

## ⚠️ Troubleshooting

### Error: "Failed to call edge function"

**Check:**
- Anon key is set correctly in `.env`
- Edge functions are deployed: `supabase functions list --project-ref aziandtcipmaphviocgz`
- OPENAI_API_KEY secret is set

### Error: "Table does not exist"

**Solution:**
- Create the required database tables (see Database Tables section above)

### Error: "Authentication failed"

**Check:**
- Anon public key is correct (not the service_role key)
- `.env` file is in the project root
- Application was rebuilt after updating `.env`

---

## 📞 Support

If you encounter issues:

1. Check the browser console for error messages
2. Check the Network tab for failed requests
3. Verify edge function logs in Supabase dashboard:
   ```
   https://supabase.com/dashboard/project/aziandtcipmaphviocgz/logs/edge-functions
   ```

---

**Next Step:** Set your `VITE_SUPABASE_ANON_KEY` in the `.env` file and rebuild the application!
