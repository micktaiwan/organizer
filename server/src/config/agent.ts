import fs from 'fs';
import path from 'path';

interface AgentConfig {
  anthropicApiKey: string;
  openaiApiKey?: string;
  agentModel?: string;
  agentEffort?: string;
  digestModel?: string;
}

let cachedConfig: AgentConfig | null = null;

export function getAgentConfig(): AgentConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(process.cwd(), 'agent-config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Agent config file not found at ${configPath}. ` +
      `Create it with: { "anthropicApiKey": "sk-ant-..." }`
    );
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(content) as AgentConfig;

  if (!config.anthropicApiKey) {
    throw new Error('anthropicApiKey is required in agent-config.json');
  }

  cachedConfig = config;
  return config;
}

export function getAnthropicApiKey(): string {
  return getAgentConfig().anthropicApiKey;
}

export function getOpenAIApiKey(): string {
  const key = getAgentConfig().openaiApiKey;
  if (!key) {
    throw new Error('openaiApiKey is required in agent-config.json for embeddings');
  }
  return key;
}

const DEFAULT_AGENT_MODEL = 'claude-sonnet-5';
const DEFAULT_DIGEST_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_AGENT_EFFORT = 'medium';

export function getAgentModel(): string {
  return getAgentConfig().agentModel || DEFAULT_AGENT_MODEL;
}

/**
 * Reasoning effort for the agent, passed to the Agent SDK query options.
 * Values: low | medium | high | xhigh | max (model-dependent).
 */
export function getAgentEffort(): string {
  return getAgentConfig().agentEffort || DEFAULT_AGENT_EFFORT;
}

export function getDigestModel(): string {
  return getAgentConfig().digestModel || DEFAULT_DIGEST_MODEL;
}
