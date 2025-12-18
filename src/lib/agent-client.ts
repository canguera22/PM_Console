/**
 * Altan Agent Communication Client
 * Handles communication with AI agents through Altan's infrastructure
 * All agents use OpenAI GPT configured in project settings
 */

import { supabaseUrl, supabaseAnonKey } from './supabase';

const PROJECT_ID = 'd0f0c464-46bc-4c91-8882-57a401f06c71';
const CLOUD_ID = '9ac0aa46-7dc2-42d2-9498-7ea7b790f287';

// Agent IDs
export const AGENT_IDS = {
  MEETING_INTELLIGENCE: '1a3daa05-5fa8-4cec-b21c-f9afa0e46248',
  PRODUCT_DOCUMENTATION: '62a90f61-5f07-4540-9af8-f5d91e9cb7a4',
  RELEASE_COMMUNICATIONS: '06f1818f-6b3b-426d-8625-14a66aeb78a4',
  WSJF_PRIORITIZATION: 'd4662c67-9e49-4353-8918-180666cd63dc',
  PM_ADVISOR: '0110bf71-e9e2-4ac5-a5a8-5ebc587201a6',
} as const;

export interface AgentCallInput {
  agent_id: string;
  message: string;
  context?: Record<string, any>;
}

export interface AgentCallResult {
  output: string;
  session_id?: string;
  agent_id?: string;
}

/**
 * Call an Altan AI agent
 * Uses Altan's infrastructure with OpenAI configured in project settings
 */
export async function callAgent(input: AgentCallInput): Promise<AgentCallResult> {
  try {
    // Call agent via Altan's agent invocation endpoint
    const response = await fetch(`https://api.altan.ai/v1/agents/${input.agent_id}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: input.message,
        context: input.context || {},
      }),
    });

    if (!response.ok) {
      // If the direct API doesn't work, try via Supabase Edge Functions
      if (response.status === 404 || response.status === 403) {
        return await callAgentViaEdgeFunction(input);
      }
      
      const errorText = await response.text();
      throw new Error(`Agent API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    return extractAgentOutput(result, input.agent_id);
  } catch (error) {
    console.error('Error calling agent via API, trying edge function:', error);
    
    // Fallback to edge function
    try {
      return await callAgentViaEdgeFunction(input);
    } catch (fallbackError) {
      console.error('Error calling agent via edge function:', fallbackError);
      throw new Error(
        `Failed to call agent: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Call agent via Supabase Edge Function
 */
async function callAgentViaEdgeFunction(input: AgentCallInput): Promise<AgentCallResult> {
  const response = await fetch(`${supabaseUrl}/functions/v1/agent-invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({
      agent_id: input.agent_id,
      message: input.message,
      context: input.context || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    
    // Check for common errors
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Authentication failed. Please check your project configuration.'
      );
    }
    
    if (response.status === 429) {
      throw new Error(
        'Rate limit exceeded. Please wait a moment and try again.'
      );
    }
    
    if (response.status === 404) {
      throw new Error(
        `Agent endpoint not found. Agent ID: ${input.agent_id}`
      );
    }
    
    throw new Error(`Agent invocation error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return extractAgentOutput(result, input.agent_id);
}

/**
 * Extract output from agent response
 */
function extractAgentOutput(result: any, agentId: string): AgentCallResult {
  // Try different possible response formats
  const output = result.output || result.response || result.text || result.message || result.data?.output || '';
  
  if (!output) {
    console.warn('Agent response:', result);
    throw new Error('Agent returned empty response. Check console for details.');
  }
  
  return {
    output: typeof output === 'string' ? output : JSON.stringify(output),
    session_id: result.session_id || result.conversation_id,
    agent_id: agentId,
  };
}
