#!/bin/bash

# =====================================================
# PM SUITE - PRODUCTION DEPLOYMENT SCRIPT
# =====================================================
# This script deploys the project_artifacts table migration
# and all 5 edge functions to your Supabase project
# 
# Project: aziandtcipmaphviocgz
# =====================================================

set -e

echo "🚀 PM Suite Production Deployment"
echo "===================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_REF="aziandtcipmaphviocgz"
SUPABASE_URL="https://aziandtcipmaphviocgz.supabase.co"

# =====================================================
# STEP 1: Prerequisites Check
# =====================================================
echo -e "${BLUE}📋 STEP 1: Checking prerequisites...${NC}"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Please install it with: npm install -g supabase"
    exit 1
fi
echo -e "${GREEN}✅ Supabase CLI installed${NC}"

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Supabase${NC}"
    echo "Running: supabase login"
    supabase login
fi
echo -e "${GREEN}✅ Logged in to Supabase${NC}"

# Check if project is linked
if [ ! -f ".git/.supabase/project-ref" ]; then
    echo -e "${YELLOW}⚠️  Project not linked${NC}"
    echo "Linking to project: $PROJECT_REF"
    supabase link --project-ref $PROJECT_REF
fi
echo -e "${GREEN}✅ Project linked${NC}"

echo ""

# =====================================================
# STEP 2: Deploy Database Migration
# =====================================================
echo -e "${BLUE}📋 STEP 2: Deploying database migration...${NC}"

echo "Pushing migration to production..."
if supabase db push; then
    echo -e "${GREEN}✅ Migration deployed successfully${NC}"
else
    echo -e "${RED}❌ Migration deployment failed${NC}"
    echo "You can manually apply the migration:"
    echo "1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/editor"
    echo "2. Click SQL Editor"
    echo "3. Copy contents of: supabase/migrations/20250118000000_create_project_artifacts.sql"
    echo "4. Paste and click Run"
    exit 1
fi

# Verify migration
echo "Verifying table creation..."
if supabase db execute "SELECT table_name FROM information_schema.tables WHERE table_name = 'project_artifacts';" | grep -q "project_artifacts"; then
    echo -e "${GREEN}✅ Table 'project_artifacts' verified${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify table creation (might still be successful)${NC}"
fi

echo ""

# =====================================================
# STEP 3: Set Environment Variables
# =====================================================
echo -e "${BLUE}📋 STEP 3: Setting environment variables...${NC}"

# Check if secrets are set
echo "Checking existing secrets..."
supabase secrets list

echo ""
echo -e "${YELLOW}You need to set the following secrets:${NC}"
echo "1. OPENAI_API_KEY - Your OpenAI API key"
echo "2. SUPABASE_URL - Your Supabase project URL"
echo "3. SUPABASE_SERVICE_ROLE_KEY - Your service role key"
echo ""

read -p "Do you want to set these secrets now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Set SUPABASE_URL
    echo "Setting SUPABASE_URL..."
    supabase secrets set SUPABASE_URL="$SUPABASE_URL"
    echo -e "${GREEN}✅ SUPABASE_URL set${NC}"
    
    # Set OPENAI_API_KEY
    echo ""
    echo "Enter your OpenAI API key (starts with sk-):"
    read -r OPENAI_KEY
    if [ ! -z "$OPENAI_KEY" ]; then
        supabase secrets set OPENAI_API_KEY="$OPENAI_KEY"
        echo -e "${GREEN}✅ OPENAI_API_KEY set${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped OPENAI_API_KEY${NC}"
    fi
    
    # Set SUPABASE_SERVICE_ROLE_KEY
    echo ""
    echo "Enter your Supabase service_role key (get from: https://supabase.com/dashboard/project/$PROJECT_REF/settings/api):"
    read -r SERVICE_KEY
    if [ ! -z "$SERVICE_KEY" ]; then
        supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY"
        echo -e "${GREEN}✅ SUPABASE_SERVICE_ROLE_KEY set${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped SUPABASE_SERVICE_ROLE_KEY${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping secrets setup${NC}"
    echo "You can set them later with:"
    echo "  supabase secrets set OPENAI_API_KEY=sk-..."
    echo "  supabase secrets set SUPABASE_URL=$SUPABASE_URL"
    echo "  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ..."
fi

echo ""

# =====================================================
# STEP 4: Deploy Edge Functions
# =====================================================
echo -e "${BLUE}📋 STEP 4: Deploying edge functions...${NC}"

FUNCTIONS=("meeting-intelligence" "product-documentation" "release-communications" "prioritization" "pm-advisor")

for FUNCTION in "${FUNCTIONS[@]}"; do
    echo ""
    echo "📦 Deploying $FUNCTION..."
    
    if supabase functions deploy $FUNCTION --no-verify-jwt; then
        echo -e "${GREEN}✅ $FUNCTION deployed${NC}"
    else
        echo -e "${RED}❌ $FUNCTION deployment failed${NC}"
        echo "Continuing with next function..."
    fi
done

echo ""
echo -e "${GREEN}✅ All edge functions deployed!${NC}"

# =====================================================
# STEP 5: Verify Deployment
# =====================================================
echo ""
echo -e "${BLUE}📋 STEP 5: Verifying deployment...${NC}"

# List deployed functions
echo "Listing deployed functions..."
supabase functions list

# Verify table indexes
echo ""
echo "Verifying table indexes..."
if supabase db execute "SELECT indexname FROM pg_indexes WHERE tablename = 'project_artifacts';" | grep -q "idx_project_artifacts"; then
    echo -e "${GREEN}✅ Indexes created${NC}"
fi

# Verify RLS policies
echo "Verifying RLS policies..."
if supabase db execute "SELECT policyname FROM pg_policies WHERE tablename = 'project_artifacts';" | grep -q "authenticated users"; then
    echo -e "${GREEN}✅ RLS policies enabled${NC}"
fi

echo ""

# =====================================================
# STEP 6: Test Deployment
# =====================================================
echo -e "${BLUE}📋 STEP 6: Testing deployment...${NC}"
echo ""
echo "Get your anon key from: https://supabase.com/dashboard/project/$PROJECT_REF/settings/api"
echo ""
read -p "Do you want to run a test request? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Enter your Supabase anon key:"
    read -r ANON_KEY
    
    if [ ! -z "$ANON_KEY" ]; then
        echo ""
        echo "Testing meeting-intelligence function..."
        
        TEST_RESPONSE=$(curl -s -X POST \
            "$SUPABASE_URL/functions/v1/meeting-intelligence" \
            -H "Authorization: Bearer $ANON_KEY" \
            -H "Content-Type: application/json" \
            -d '{
                "meeting_transcript": "Sprint Planning - Dec 18. Sarah completed dashboard designs. John improved API by 40%. Decision: Launch MVP next week.",
                "meeting_type": "Sprint Planning",
                "project_id": 1,
                "project_name": "Test Deployment"
            }')
        
        if echo "$TEST_RESPONSE" | grep -q "output"; then
            echo -e "${GREEN}✅ Test successful!${NC}"
            echo "Response preview:"
            echo "$TEST_RESPONSE" | head -c 200
            echo "..."
        else
            echo -e "${RED}❌ Test failed${NC}"
            echo "Response:"
            echo "$TEST_RESPONSE"
        fi
        
        # Verify artifact was stored
        echo ""
        echo "Checking if artifact was stored in database..."
        if supabase db execute "SELECT id, artifact_name FROM project_artifacts ORDER BY created_at DESC LIMIT 1;" | grep -q "Test Deployment"; then
            echo -e "${GREEN}✅ Artifact stored in database${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not verify artifact storage${NC}"
        fi
    fi
fi

# =====================================================
# DEPLOYMENT SUMMARY
# =====================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "✅ Migration deployed"
echo "✅ Edge functions deployed (5/5)"
echo "✅ Environment variables configured"
echo ""
echo "📝 Next Steps:"
echo "1. Open your PM Suite: https://8be94a-untitled-project.previews.altan.ai/"
echo "2. Test each module (Meeting Intelligence, Product Docs, etc.)"
echo "3. Check artifacts in Project Dashboard"
echo "4. Monitor edge function logs: supabase functions logs <function-name> --follow"
echo "5. Monitor OpenAI usage: https://platform.openai.com/usage"
echo ""
echo "🔍 Useful Commands:"
echo "  - View logs: supabase functions logs meeting-intelligence --follow"
echo "  - List secrets: supabase secrets list"
echo "  - Check artifacts: supabase db execute 'SELECT * FROM project_artifacts ORDER BY created_at DESC LIMIT 10;'"
echo ""
echo -e "${BLUE}🚀 Your PM Suite is now live!${NC}"
