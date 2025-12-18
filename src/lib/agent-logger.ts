/**
 * Agent Logger - Comprehensive logging utility for all agent calls
 * Provides structured logging for debugging and monitoring
 */

import { toast } from 'sonner';

interface LogEntry {
  timestamp: string;
  action: string;
  module: string;
  requestUrl?: string;
  payload?: any;
  responseStatus?: number;
  responseBody?: any;
  error?: any;
  duration?: number;
}

export class AgentLogger {
  private static logs: LogEntry[] = [];

  static logRequest(module: string, functionName: string, payload: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      action: 'REQUEST_SENT',
      module,
      requestUrl: `https://aziandtcipmaphviocgz.supabase.co/functions/v1/${functionName}`,
      payload,
    };

    this.logs.push(entry);
    console.log('🚀 [Agent Request]', entry);
    return entry;
  }

  static logResponse(module: string, responseStatus: number, responseBody: any, duration: number) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      action: 'RESPONSE_RECEIVED',
      module,
      responseStatus,
      responseBody,
      duration,
    };

    this.logs.push(entry);
    console.log('✅ [Agent Response]', entry);
    return entry;
  }

  static logError(module: string, error: any, duration?: number) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      action: 'ERROR',
      module,
      error: {
        message: error.message,
        status: error.status,
        details: error.details || error,
      },
      duration,
    };

    this.logs.push(entry);
    console.error('❌ [Agent Error]', entry);
    return entry;
  }

  static getLogs() {
    return this.logs;
  }

  static clearLogs() {
    this.logs = [];
  }
}

/**
 * Wrapper function to call agents with comprehensive logging
 */
export async function callAgentWithLogging<T>(
  module: string,
  functionName: string,
  payload: any,
  agentFunction: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  // Log request
  AgentLogger.logRequest(module, functionName, payload);

  try {
    // Call agent
    const response = await agentFunction();

    // Log response
    const duration = Date.now() - startTime;
    AgentLogger.logResponse(module, 200, response, duration);

    return response;
  } catch (error: any) {
    // Log error
    const duration = Date.now() - startTime;
    AgentLogger.logError(module, error, duration);

    // Re-throw to be handled by UI
    throw error;
  }
}

/**
 * Parse error message into user-friendly format
 */
export function parseErrorMessage(error: any): string {
  // Network errors
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return 'Network error: Unable to reach server. Check your connection.';
  }

  // OpenAI API key missing
  if (error.message?.includes('OPENAI_API_KEY') || error.message?.includes('API key not configured')) {
    return 'OpenAI API key not configured. Please set OPENAI_API_KEY in Supabase secrets.';
  }

  // Authentication errors
  if (error.status === 401 || error.message?.includes('Authentication')) {
    return 'Authentication error: Invalid Supabase anon key.';
  }

  // Edge function not found
  if (error.status === 404 || error.message?.includes('not found')) {
    return 'Edge function not found. Ensure the function is deployed to Supabase.';
  }

  // Server errors
  if (error.status === 500) {
    return `Server error: ${error.message || 'Unknown error occurred'}`;
  }

  // Rate limit
  if (error.status === 429) {
    return 'Rate limit exceeded. Please wait a moment and try again.';
  }

  // Default error message
  return error.message || 'An unexpected error occurred. Please try again.';
}
