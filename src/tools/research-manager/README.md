# Research Manager (`research`)

## Overview

Performs deep research on topics using Perplexity Sonar via OpenRouter. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter | Type     | Description                                | Required |
| --------- | -------- | ------------------------------------------ | -------- |
| `query`   | `string` | The research query or topic to investigate | Yes      |

*(Based on the Zod schema defined in `src/server.ts`)*

## Outputs

* **Primary Output:** A comprehensive research report on the specified topic, formatted in Markdown.
* **File Storage:** The generated artifact is saved for historical purposes to:
  `workflow-agent-files/research-manager/[timestamp]-[sanitized-query]-research.md`
* **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming query parameter is validated.
2. **Research Phase (Primary Function):**
   * Performs the main research query using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   * This phase is the primary function of the research-manager (unlike other tools where research is a preliminary step).
3. **Enhancement Phase:**
   * Calls the `processWithSequentialThinking` function to enhance and organize the research findings.
   * This internally uses the configured Gemini model (`google/gemini-2.0-flash-001`) along with the research-specific system prompt (`RESEARCH_SYSTEM_PROMPT` defined in `index.ts`) to structure and refine the research.
4. **Output Processing & Saving:**
   * Formats the enhanced research with a title header and timestamp.
   * Saves the research document to the `workflow-agent-files/research-manager/` directory.
5. **Response:** Returns the formatted research content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: research] --> B{Input Query Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> D[1. Call performResearchQuery (Perplexity)];
    D --> E[2. Enhance Research with Sequential Thinking (Gemini)];
    E --> G[3. Format Research Document];
    G --> H[4. Save Research to workflow-agent-files];
    H --> I[5. Return Research Response via MCP];

    D -- Error --> DE[Log Research Error, Return Error Response];
    E -- Error --> EE[Log Enhancement Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
I need to research the latest advancements in quantum computing.
```

## System Prompt

The research enhancement logic uses `processWithSequentialThinking` guided by the following system prompt (defined in `index.ts`):

```markdown
# Research Manager System Prompt Snippet
You are a research specialist with advanced capabilities for gathering accurate, comprehensive, and relevant information.
Your goal is to provide complete, thoughtful analyses that cover the topic thoroughly, leaving no important aspects unaddressed.

When conducting research, follow these guidelines:
1. Be comprehensive - cover all relevant aspects of the topic
2. Organize information logically with clear sections and headings
...

Format your response as a well-structured research report with these sections:
- Executive Summary
- Key Findings
- Detailed Analysis
- Practical Applications
- Limitations and Caveats
- Recommendations
...
```

## Error Handling

* Handles invalid input parameters.
* Reports errors during the Perplexity research phase.
* Handles potential errors during the enhancement phase.
* Handles potential errors during file saving (logs and proceeds).
* Returns specific error messages via MCP response when failures occur.
