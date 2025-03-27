import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

// Ensure directories exist
const PRD_DIR = path.join(process.cwd(), 'workflow-agent-files', 'prd-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(PRD_DIR);
}

// PRD-specific system prompt
const PRD_SYSTEM_PROMPT = `
You are an AI assistant expert at generating comprehensive Product Requirements Documents (PRDs).
Based SOLELY on the provided product description, generate a detailed PRD.

**PRD Structure:** Include standard sections like:
1.  **Introduction/Overview:** Purpose, Goals (if inferrable).
2.  **Target Audience:** Describe likely users.
3.  **Features & Functionality:** Detail key features. Use User Stories (As a [user], I want [action], so that [benefit]) where appropriate for clarity.
4.  **User Experience (Optional):** Describe desired UX/UI feel if possible.
5.  **Technical Considerations (Optional):** Suggest potential tech stack elements if relevant to the description.
6.  **Success Metrics (Optional):** Suggest potential KPIs.
7.  **Out-of-Scope Items (Optional):** Mention features likely excluded based on the description.

**Guidelines:**
*   Focus on interpreting the input \`productDescription\` accurately and elaborating on it.
*   Generate content that is clear, detailed, and well-formatted using Markdown.
*   Do NOT assume access to external files or previous context.
*   Do NOT include instructions about using Perplexity or iterative research within this prompt itself.
*   The goal is to generate a high-quality PRD from the given description in one pass.
`;

/**
 * Generate a PRD for a product based on a description
 */
export async function generatePRD(
  productDescription: string,
  config: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    await initDirectories();
    
    // Generate a filename for storing the PRD
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-prd.md`;
    const filePath = path.join(PRD_DIR, filename);
    
    // Process the PRD generation with sequential thinking
    console.error(`Generating PRD for: ${productDescription.substring(0, 50)}...`);
    
    const prdResult = await processWithSequentialThinking(
      `Create a comprehensive PRD for the following product:\n\n${productDescription}`, 
      config,
      PRD_SYSTEM_PROMPT
    );
    
    // Format the PRD with a title header
    const titleMatch = prdResult.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `PRD: ${productDescription.substring(0, 50)}...`;
    const formattedResult = `# ${title}\n\n${prdResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    
    return {
      content: [
        {
          type: "text",
          text: formattedResult
        }
      ]
    };
  } catch (error) {
    console.error('PRD Generator Error:', error);
    return {
      content: [
        {
          type: "text",
          text: `Error generating PRD: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
