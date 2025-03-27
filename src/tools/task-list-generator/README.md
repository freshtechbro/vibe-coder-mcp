# Task List Generator (`generate-task-list`)

## Overview

Creates structured development task lists with dependencies. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter            | Type        | Description                                     | Required |
| -------------------- | ----------- | ----------------------------------------------- | -------- |
| `productDescription` | `string`    | Description of the product                      | Yes      |
| `userStories`        | `string`    | User stories to use for task list generation    | Yes      |

*(Based on the Zod schema defined in `src/server.ts`)*

## Outputs

* **Primary Output:** A comprehensive development task list in Markdown format, hierarchically organized with dependencies, priorities, and estimations.
* **File Storage:** The generated artifact is saved for historical purposes to:
  `workflow-agent-files/task-list-generator/[timestamp]-[sanitized-name]-task-list.md`
* **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming parameters (product description and user stories) are validated.
2. **Research Phase (Pre-Generation):**
   * Formulates three specific queries based on the inputs:
     * Software development lifecycle tasks and milestones for the specific product
     * Task estimation and dependency management best practices
     * Development team structures and work breakdown for similar projects
   * Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   * Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original inputs (product description and user stories) and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase:**
   * Calls the `processWithSequentialThinking` function.
   * This internally uses the configured Gemini model (`google/gemini-2.0-flash-001`) along with the task list-specific system prompt (`TASK_LIST_SYSTEM_PROMPT` defined in `index.ts`) to generate the task list based on the assembled prompt.
5. **Output Processing & Saving:**
   * Formats the generated task list with a title header and timestamp.
   * Saves the task list document to the `workflow-agent-files/task-list-generator/` directory.
6. **Response:** Returns the formatted task list content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-task-list] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call processWithSequentialThinking (Gemini + System Prompt)];
    F --> G[5. Format Task List Document];
    G --> H[6. Save Task List to workflow-agent-files];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate a task list for developing a mobile app that helps users track their daily water intake. User stories have already been created and include features for tracking intake, setting reminders, and viewing hydration statistics.
```

## System Prompt

The core generation logic uses `processWithSequentialThinking` guided by the following system prompt (defined in `index.ts`):

```markdown
# Task List Generator System Prompt Snippet
You are an AI assistant expert at generating development task lists for software projects.
Based on the provided product description, user stories, and research context, generate a detailed task list.

## Using Research Context
* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* This research contains valuable insights on development lifecycle, task estimation, and team structure.
* Use these insights to inform your task list while keeping the focus on the primary product requirements.
* Pay special attention to the "Development Lifecycle & Milestones" and "Task Estimation & Dependencies" sections...

## Task Template
Each task should include:
- **Task ID**: A unique identifier (T-001, T-002, etc.)
- **Task Title**: Clear, action-oriented title starting with a verb
- **Description**: Explanation of what needs to be done
...
```

## Error Handling

* Handles invalid input parameters.
* Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
* Reports errors during the main generation phase.
* Handles potential errors during file saving (typically logs warning and proceeds).
* Returns specific error messages via MCP response when failures occur.
