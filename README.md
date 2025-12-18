# Product Manager Console

A comprehensive product management toolkit powered by AI agents. Create meeting summaries, PRDs, release communications, prioritization analyses, and get PM advisor feedback—all in one place.

## 🚀 Features

- **Meeting Intelligence**: Transform meeting transcripts into structured summaries, action items, and decisions
- **Product Documentation**: Generate PRDs, user stories, and technical specifications
- **Release Communications**: Create release notes, stakeholder updates, and announcement emails
- **Backlog Prioritization**: Apply WSJF and other frameworks to prioritize features
- **PM Advisor**: Get cross-artifact feedback and consistency analysis from an AI senior PM

## 📋 Prerequisites

- Node.js 18+ and npm
- A Supabase account ([sign up free](https://supabase.com))
- ElevenLabs AI Agent API access (for agent functions)

## 🛠️ Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd pm-console
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Where to find these values:**
- Go to [Supabase Dashboard](https://supabase.com/dashboard)
- Select your project
- Go to Settings > API
- Copy "Project URL" → `VITE_SUPABASE_URL`
- Copy "anon public" key → `VITE_SUPABASE_ANON_KEY`

### 3. Deploy Database Schema

Install Supabase CLI if you haven't:

```bash
npm install -g supabase
```

Link to your Supabase project:

```bash
supabase link --project-ref your-project-ref
```

Deploy the migration:

```bash
supabase db push
```

This creates:
- `projects` table (UUID primary key)
- `project_artifacts` table (stores all generated artifacts)
- Demo-open RLS policies (replace with Firebase auth later)
- Helper views for latest/reviewed artifacts
- Demo project seed data

### 4. Deploy Edge Functions

Each AI agent runs as a Supabase Edge Function. Deploy them:

```bash
# Set ElevenLabs API key as secret
supabase secrets set ELEVENLABS_API_KEY=your-api-key-here

# Deploy all functions
supabase functions deploy meeting-intelligence
supabase functions deploy product-documentation
supabase functions deploy release-communications
supabase functions deploy prioritization
supabase functions deploy pm-advisor
```

**Get your ElevenLabs API key:**
- Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/conversational-ai)
- Create AI agents for each module (Meeting Intelligence, Product Documentation, etc.)
- Copy Agent IDs from each agent's settings
- Update agent IDs in corresponding edge function files

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🧪 Verification Checklist

After setup, verify everything works:

### Database
- [ ] Tables created: `projects`, `project_artifacts`
- [ ] Demo project exists: Query `SELECT * FROM projects;`
- [ ] RLS policies active: `SELECT * FROM pg_policies WHERE tablename = 'project_artifacts';`

### Edge Functions
- [ ] All 5 functions deployed successfully
- [ ] `ELEVENLABS_API_KEY` secret is set: `supabase secrets list`
- [ ] Functions respond: Test with curl or Postman

### Frontend
- [ ] App loads without errors at `http://localhost:5173`
- [ ] Active project selector shows demo project
- [ ] Dashboard displays "0 artifacts" initially
- [ ] All module pages accessible from navigation

### End-to-End Test
1. Go to **Meeting Intelligence**
2. Use sample transcript or paste your own
3. Select outputs and submit
4. Wait for agent response
5. Verify artifact appears in **Project Dashboard**
6. Click "Run PM Advisor" on dashboard
7. Verify PM Advisor creates feedback artifact
8. Verify dashboard auto-refreshes after advisor run

## 📁 Project Structure

```
pm-console/
├── src/
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client (uses env vars)
│   │   ├── agent-types.ts           # Shared TypeScript types
│   │   ├── agent.ts                 # Meeting Intelligence agent
│   │   ├── documentation-agent.ts   # Product Documentation agent
│   │   ├── release-agent.ts         # Release Communications agent
│   │   ├── prioritization-agent.ts  # Prioritization agent
│   │   └── pm-advisor.ts            # PM Advisor agent
│   ├── contexts/
│   │   ├── ActiveProjectContext.tsx # Legacy project context
│   │   └── ProjectContext.tsx       # New portable project context
│   ├── pages/
│   │   ├── Dashboard.tsx            # Main navigation hub
│   │   ├── ProjectDashboard.tsx     # All artifacts view
│   │   ├── MeetingIntelligence.tsx
│   │   ├── ProductDocumentation.tsx
│   │   ├── ReleaseCommunications.tsx
│   │   └── Prioritization.tsx
│   └── components/
│       ├── ActiveProjectSelector.tsx # Project switcher
│       └── ui/                       # shadcn components
├── supabase/
│   ├── functions/                   # Edge Functions (AI agents)
│   │   ├── meeting-intelligence/
│   │   ├── product-documentation/
│   │   ├── release-communications/
│   │   ├── prioritization/
│   │   └── pm-advisor/
│   └── migrations/
│       ├── 20250118000000_create_project_artifacts.sql
│       └── 20250118000001_demo_setup.sql
├── .env.example                     # Environment variables template
├── .env.local                       # Your actual config (gitignored)
├── package.json                     # npm dependencies
└── README.md                        # This file
```

## 🔐 Security Notes

### Current State (Demo-Ready)
- **RLS Policies**: Wide open for `anon` and `authenticated` roles
- **Purpose**: Easy testing without authentication
- **WARNING**: Do NOT use in production with real data

### Production Deployment
Replace demo-open RLS policies with proper authentication:

1. **Integrate Firebase Authentication**
   - Add Firebase SDK to frontend
   - Create sign-up/sign-in flows
   - Store user IDs in Supabase

2. **Update RLS Policies**
   ```sql
   -- Example: User can only access their own projects
   CREATE POLICY "Users can view own projects"
     ON projects FOR SELECT
     USING (auth.uid() = user_id);
   ```

3. **Add User Column**
   ```sql
   ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES auth.users(id);
   ALTER TABLE project_artifacts ADD COLUMN user_id UUID REFERENCES auth.users(id);
   ```

## 🚢 Deployment

### Deploy to Vercel

1. Push to GitHub
2. Import repository in [Vercel Dashboard](https://vercel.com/new)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

### Deploy to Netlify

1. Push to GitHub
2. Import repository in [Netlify Dashboard](https://app.netlify.com/start)
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables in Site Settings
5. Deploy

## 🧩 Architecture

### Data Flow

```
User Input → Frontend Page → Agent Library → Edge Function → ElevenLabs AI Agent
                                                                      ↓
                                                              Structured Output
                                                                      ↓
                                                           Stored in Supabase
                                                                      ↓
                                                          Displayed in Dashboard
```

### Project ID Flow

All agents require a **UUID project_id**:
- Frontend stores active project in `ActiveProjectContext`
- Each agent call includes `project_id` (UUID string)
- Edge functions validate UUID format
- Artifacts stored with `project_id` foreign key

### PM Advisor Integration

PM Advisor provides cross-artifact feedback:
1. User clicks "Run PM Advisor" in Project Dashboard
2. Frontend fetches all artifacts for active project
3. Calls `pm-advisor` edge function with context
4. Agent reviews artifacts for consistency, completeness, quality
5. Stores feedback as `pm_advisor_feedback` artifact type
6. Dashboard auto-refreshes to show new feedback

## 🛠️ Development

### Run Tests

```bash
npm run lint
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## 📚 API Reference

### Edge Functions

All edge functions accept JSON POST requests and return structured responses.

#### Common Request Format
```json
{
  "project_id": "uuid-string",
  "project_name": "My Project",
  "artifact_name": "Optional custom name",
  ...module-specific fields
}
```

#### Common Response Format
```json
{
  "output": "Generated content in markdown",
  "artifact_id": "uuid-of-created-artifact"
}
```

### Database Schema

#### `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Project name |
| description | TEXT | Optional description |
| created_at | TIMESTAMPTZ | Creation timestamp |
| status | TEXT | 'active', 'archived', 'deleted' |

#### `project_artifacts`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| project_name | TEXT | Denormalized project name |
| artifact_type | TEXT | 'meeting_intelligence', 'product_documentation', etc. |
| artifact_name | TEXT | User-provided or auto-generated name |
| output_data | TEXT | Generated content (markdown) |
| metadata | JSONB | Additional structured data |
| advisor_feedback | TEXT | PM Advisor review (if any) |
| advisor_reviewed_at | TIMESTAMPTZ | When reviewed |
| status | TEXT | 'active', 'archived', 'deleted' |
| created_at | TIMESTAMPTZ | Creation timestamp |

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/pm-console/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/pm-console/discussions)
- **Email**: support@yourcompany.com

## 🎯 Roadmap

- [ ] Firebase Authentication integration
- [ ] Production-ready RLS policies
- [ ] User profile management
- [ ] Team collaboration features
- [ ] Advanced artifact search and filtering
- [ ] Export artifacts to PDF/Word
- [ ] Webhook integrations (Slack, Jira, etc.)
- [ ] Mobile responsive improvements
- [ ] Internationalization (i18n)

---

Built with ❤️ using React, TypeScript, Supabase, and ElevenLabs AI Agents
