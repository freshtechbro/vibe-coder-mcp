// src/types/sequentialThought.ts
import { z } from 'zod';

/**
 * Zod schema for validating the structure of a SequentialThought object.
 * This ensures the JSON output from the sequential thinking LLM adheres
 * to the expected format.
 */
export const sequentialThoughtSchema = z.object({
  thought: z.string({
    required_error: "The 'thought' field is required.",
    invalid_type_error: "'thought' must be a string.",
  }),
  next_thought_needed: z.boolean({
    required_error: "The 'next_thought_needed' field is required.",
    invalid_type_error: "'next_thought_needed' must be a boolean.",
  }),
  thought_number: z.number({
    required_error: "The 'thought_number' field is required.",
    invalid_type_error: "'thought_number' must be a number.",
  }).int({ message: "'thought_number' must be an integer." })
    .positive({ message: "'thought_number' must be a positive number." }), // Ensure it's a positive integer
  total_thoughts: z.number({
    required_error: "The 'total_thoughts' field is required.",
    invalid_type_error: "'total_thoughts' must be a number.",
  }).int({ message: "'total_thoughts' must be an integer." })
    .positive({ message: "'total_thoughts' must be a positive number." }), // Ensure it's a positive integer

  // Optional fields
  is_revision: z.boolean({
    invalid_type_error: "'is_revision' must be a boolean.",
  }).optional(),
  revises_thought: z.number({
    invalid_type_error: "'revises_thought' must be a number.",
  }).int({ message: "'revises_thought' must be an integer." })
    .positive({ message: "'revises_thought' must be a positive number." })
    .optional(),
  branch_from_thought: z.number({
    invalid_type_error: "'branch_from_thought' must be a number.",
  }).int({ message: "'branch_from_thought' must be an integer." })
    .positive({ message: "'branch_from_thought' must be a positive number." })
    .optional(),
  branch_id: z.string({
    invalid_type_error: "'branch_id' must be a string.",
  }).optional(),
  needs_more_thoughts: z.boolean({
    invalid_type_error: "'needs_more_thoughts' must be a boolean.",
  }).optional(),
});

// Export the inferred TypeScript type for convenience
export type SequentialThought = z.infer<typeof sequentialThoughtSchema>;
