// MCP server with all tools
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { searchMemoriesTool, getRecentMemoriesTool, storeMemoryTool, deleteMemoryTool } from './memory-tools.mjs';
import { searchNotesTool, getNoteTool } from './notes-tools.mjs';
import { searchSelfTool, storeSelfTool, deleteSelfTool } from './self-tools.mjs';
import { searchGoalsTool, storeGoalTool, deleteGoalTool } from './goals-tools.mjs';
import { respondTool } from './respond-tool.mjs';

const petServer = createSdkMcpServer({
  name: 'pet',
  version: '1.0.0',
  tools: [
    // Memory tools (facts about users/world)
    searchMemoriesTool,
    getRecentMemoriesTool,
    storeMemoryTool,
    deleteMemoryTool,
    // Self tools (pet identity)
    searchSelfTool,
    storeSelfTool,
    deleteSelfTool,
    // Goals tools (pet aspirations)
    searchGoalsTool,
    storeGoalTool,
    deleteGoalTool,
    // Notes tools
    searchNotesTool,
    getNoteTool,
    // Response
    respondTool
  ]
});

export { petServer };
