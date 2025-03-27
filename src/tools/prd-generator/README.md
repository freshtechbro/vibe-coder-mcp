# PRD Generator (`generate-prd`)

## Overview

Creates comprehensive product requirements documents. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter             | Type        | Description                                     | Required |
| --------------------- | ----------- | ----------------------------------------------- | -------- |
| `productDescription`  | `string`    | Description of the product to create a PRD for  | Yes      |

*(Based on the Zod schema defined in `src/server.ts`)*

## Outputs

* **Primary Output:** A comprehensive Product Requirements Document (PRD) in Markdown format.
* **File Storage:** The generated artifact is saved for historical purposes to:
  `workflow-agent-files/prd-generator/[timestamp]-[sanitized-name]-prd.md`
* **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming product description parameter is validated.
2. **Research Phase (Pre-Generation):**
   * Formulates three specific queries based on the product description:
     * Market analysis and competitive landscape
     * User needs, demographics, and expectations
     * Industry standards, best practices, and common feature sets
   * Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   * Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original product description and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase:**
   * Calls the `processWithSequentialThinking` function.
   * This internally uses the configured Gemini model (`google/gemini-2.0-flash-001`) along with the PRD-specific system prompt (`PRD_SYSTEM_PROMPT` defined in `index.ts`) to generate the PRD based on the assembled prompt.
5. **Output Processing & Saving:**
   * Formats the generated PRD with a title header and timestamp.
   * Saves the PRD document to the `workflow-agent-files/prd-generator/` directory.
6. **Response:** Returns the formatted PRD content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-prd] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call processWithSequentialThinking (Gemini + System Prompt)];
    F --> G[5. Format PRD Document];
    G --> H[6. Save PRD to workflow-agent-files];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Create a PRD for a mobile app that helps users track their daily water intake, send reminders, and visualize their hydration progress over time.
```

## System Prompt

The core generation logic uses `processWithSequentialThinking` guided by the following system prompt (defined in `index.ts`):

```markdown
# PRD Generator System Prompt Snippet
You are an AI assistant expert at generating comprehensive Product Requirements Documents (PRDs).
Based on the provided product description and research context, generate a detailed PRD.

**Using Research Context:**
* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* Use this research information to inform your output, ensuring it reflects current market trends, user expectations, and industry standards.
* Incorporate relevant insights from the research while keeping the focus on the primary product description.

**PRD Structure:** Include standard sections like:
1.  **Introduction/Overview:** Purpose, Goals (if inferrable).
2.  **Target Audience:** Describe likely users, informed by the research on user demographics.
...
```

## Error Handling

* Handles invalid input parameters.
* Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
* Reports errors during the main generation phase.
* Handles potential errors during file saving (typically logs warning and proceeds).
* Returns specific error messages via MCP response when failures occur.
