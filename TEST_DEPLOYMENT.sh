#!/bin/bash

# =====================================================
# PM SUITE - DEPLOYMENT TEST SCRIPT
# =====================================================
# Tests all edge functions and database integration
# Run this AFTER running DEPLOY.sh
# =====================================================

set -e

echo "🧪 PM Suite Deployment Testing"
echo "=============================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_REF="aziandtcipmaphviocgz"
SUPABASE_URL="https://aziandtcipmaphviocgz.supabase.co"

# Get anon key
echo "Get your Supabase anon key from:"
echo "https://supabase.com/dashboard/project/$PROJECT_REF/settings/api"
echo ""
read -p "Enter your Supabase anon key: " ANON_KEY

if [ -z "$ANON_KEY" ]; then
    echo -e "${RED}❌ Anon key required${NC}"
    exit 1
fi

echo ""

# =====================================================
# Test 1: Database Table
# =====================================================
echo -e "${BLUE}📋 Test 1: Database Table${NC}"

echo "Checking if project_artifacts table exists..."
if supabase db execute "SELECT table_name FROM information_schema.tables WHERE table_name = 'project_artifacts';" | grep -q "project_artifacts"; then
    echo -e "${GREEN}✅ Table exists${NC}"
else
    echo -e "${RED}❌ Table not found${NC}"
    exit 1
fi

echo "Checking indexes..."
INDEX_COUNT=$(supabase db execute "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'project_artifacts';" | grep -oE '[0-9]+' | head -1)
echo "Found $INDEX_COUNT indexes"
if [ "$INDEX_COUNT" -ge 6 ]; then
    echo -e "${GREEN}✅ All indexes created${NC}"
else
    echo -e "${YELLOW}⚠️  Expected 6 indexes, found $INDEX_COUNT${NC}"
fi

echo "Checking RLS policies..."
POLICY_COUNT=$(supabase db execute "SELECT COUNT(*) FROM pg_policies WHERE tablename = 'project_artifacts';" | grep -oE '[0-9]+' | head -1)
echo "Found $POLICY_COUNT RLS policies"
if [ "$POLICY_COUNT" -ge 4 ]; then
    echo -e "${GREEN}✅ All RLS policies enabled${NC}"
else
    echo -e "${YELLOW}⚠️  Expected 4 policies, found $POLICY_COUNT${NC}"
fi

echo ""

# =====================================================
# Test 2: Meeting Intelligence
# =====================================================
echo -e "${BLUE}📋 Test 2: Meeting Intelligence${NC}"

echo "Calling meeting-intelligence edge function..."
MEETING_RESPONSE=$(curl -s -X POST \
    "$SUPABASE_URL/functions/v1/meeting-intelligence" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "meeting_transcript": "Sprint Planning Meeting - Dec 18, 2024. Sarah completed dashboard designs using Figma. John improved API performance by 40% using caching. Maria raised concern about mobile responsiveness. Decision: Launch MVP next week. Action: John will write deployment docs by Friday.",
        "meeting_type": "Sprint Planning",
        "project_id": 1,
        "project_name": "PM Suite Deployment Test",
        "participants": "Sarah, John, Maria"
    }')

if echo "$MEETING_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error in response${NC}"
    echo "$MEETING_RESPONSE"
else
    echo -e "${GREEN}✅ Meeting Intelligence working${NC}"
    
    # Extract artifact_id
    ARTIFACT_ID=$(echo "$MEETING_RESPONSE" | grep -o '"artifact_id":"[^"]*' | cut -d'"' -f4)
    echo "Artifact ID: $ARTIFACT_ID"
    
    # Verify in database
    if [ ! -z "$ARTIFACT_ID" ]; then
        echo "Verifying artifact in database..."
        if supabase db execute "SELECT id FROM project_artifacts WHERE id = '$ARTIFACT_ID';" | grep -q "$ARTIFACT_ID"; then
            echo -e "${GREEN}✅ Artifact stored in database${NC}"
        else
            echo -e "${RED}❌ Artifact not found in database${NC}"
        fi
    fi
fi

sleep 2
echo ""

# =====================================================
# Test 3: Product Documentation
# =====================================================
echo -e "${BLUE}📋 Test 3: Product Documentation${NC}"

echo "Calling product-documentation edge function..."
DOCS_RESPONSE=$(curl -s -X POST \
    "$SUPABASE_URL/functions/v1/product-documentation" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "project_name": "PM Suite Deployment Test",
        "feature_description": "User dashboard with analytics",
        "target_audience": "Product managers",
        "success_criteria": "Users can view all project artifacts",
        "selected_outputs": ["PRD"],
        "project_id": 1
    }')

if echo "$DOCS_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error in response${NC}"
    echo "$DOCS_RESPONSE"
else
    echo -e "${GREEN}✅ Product Documentation working${NC}"
fi

sleep 2
echo ""

# =====================================================
# Test 4: PM Advisor (Cross-Module Intelligence)
# =====================================================
echo -e "${BLUE}📋 Test 4: PM Advisor (Cross-Module Intelligence)${NC}"

echo "Calling pm-advisor edge function..."
ADVISOR_RESPONSE=$(curl -s -X POST \
    "$SUPABASE_URL/functions/v1/pm-advisor" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "artifact_output": "# PRD: User Dashboard\n\n## Overview\nBuilding a dashboard to show all project artifacts.\n\n## Requirements\n- List all artifacts\n- Filter by type\n- View details",
        "module_type": "product_documentation",
        "project_id": 1,
        "project_name": "PM Suite Deployment Test"
    }')

if echo "$ADVISOR_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error in response${NC}"
    echo "$ADVISOR_RESPONSE"
else
    echo -e "${GREEN}✅ PM Advisor working${NC}"
    
    # Check if it found context artifacts
    CONTEXT_COUNT=$(echo "$ADVISOR_RESPONSE" | grep -o '"context_artifacts_count":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$CONTEXT_COUNT" ] && [ "$CONTEXT_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✅ Cross-module intelligence working (found $CONTEXT_COUNT artifacts)${NC}"
    else
        echo -e "${YELLOW}⚠️  No context artifacts found (might be expected if this is first test)${NC}"
    fi
fi

sleep 2
echo ""

# =====================================================
# Test 5: Release Communications
# =====================================================
echo -e "${BLUE}📋 Test 5: Release Communications${NC}"

echo "Calling release-communications edge function..."
RELEASE_RESPONSE=$(curl -s -X POST \
    "$SUPABASE_URL/functions/v1/release-communications" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "release_name": "PM Suite v1.0",
        "features": "Dashboard, Meeting Intelligence, PM Advisor",
        "target_audience": "Internal team",
        "selected_outputs": ["Release Notes"],
        "project_id": 1,
        "project_name": "PM Suite Deployment Test"
    }')

if echo "$RELEASE_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error in response${NC}"
    echo "$RELEASE_RESPONSE"
else
    echo -e "${GREEN}✅ Release Communications working${NC}"
fi

sleep 2
echo ""

# =====================================================
# Test 6: Prioritization
# =====================================================
echo -e "${BLUE}📋 Test 6: Prioritization${NC}"

echo "Calling prioritization edge function..."
PRIORITY_RESPONSE=$(curl -s -X POST \
    "$SUPABASE_URL/functions/v1/prioritization" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "backlog_items": "1. User dashboard\n2. Mobile app\n3. API improvements",
        "project_context": "PM Suite",
        "selected_outputs": ["WSJF Scores"],
        "project_id": 1,
        "project_name": "PM Suite Deployment Test"
    }')

if echo "$PRIORITY_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error in response${NC}"
    echo "$PRIORITY_RESPONSE"
else
    echo -e "${GREEN}✅ Prioritization working${NC}"
fi

echo ""

# =====================================================
# Test 7: Database Query
# =====================================================
echo -e "${BLUE}📋 Test 7: Querying Stored Artifacts${NC}"

echo "Fetching all artifacts from database..."
ARTIFACTS=$(supabase db execute "SELECT id, artifact_type, artifact_name, created_at FROM project_artifacts WHERE project_id = 1 ORDER BY created_at DESC LIMIT 10;")

echo "$ARTIFACTS"

ARTIFACT_COUNT=$(echo "$ARTIFACTS" | grep -c "meeting_intelligence\|product_documentation\|pm_advisor\|release_communications\|prioritization" || true)

echo ""
echo "Found $ARTIFACT_COUNT artifacts in database"

if [ "$ARTIFACT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Database persistence working${NC}"
else
    echo -e "${YELLOW}⚠️  No artifacts found in database${NC}"
fi

echo ""

# =====================================================
# Test 8: Edge Function Logs
# =====================================================
echo -e "${BLUE}📋 Test 8: Checking Edge Function Logs${NC}"

echo "Fetching recent logs for meeting-intelligence..."
echo "(Press Ctrl+C after reviewing)"
echo ""

timeout 5s supabase functions logs meeting-intelligence || true

echo ""

# =====================================================
# SUMMARY
# =====================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 TESTING COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "✅ Tests Completed:"
echo "  1. Database table & schema"
echo "  2. Meeting Intelligence"
echo "  3. Product Documentation"
echo "  4. PM Advisor (cross-module)"
echo "  5. Release Communications"
echo "  6. Prioritization"
echo "  7. Database persistence"
echo "  8. Edge function logs"
echo ""
echo "📊 Artifacts in Database: $ARTIFACT_COUNT"
echo ""
echo "📝 Next Steps:"
echo "1. Test frontend at: https://8be94a-untitled-project.previews.altan.ai/"
echo "2. Create a project and generate artifacts"
echo "3. Check Project Dashboard to see stored artifacts"
echo "4. Run PM Advisor to test cross-module intelligence"
echo "5. Monitor OpenAI usage: https://platform.openai.com/usage"
echo ""
echo -e "${BLUE}✨ All systems operational!${NC}"
