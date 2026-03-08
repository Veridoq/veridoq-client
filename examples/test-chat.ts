/**
 * Test script for document chat.
 * 
 * Usage:
 *   VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-chat.ts <document-id> [question]
 */

import { VeridoqClient, VeridoqError } from "../dist/index.js";
import readline from "readline";

async function main() {
  const apiKey = process.env.VERIDOQ_API_KEY;
  const baseUrl = process.env.VERIDOQ_API_URL || "http://localhost:3000";

  if (!apiKey) {
    console.error("Error: VERIDOQ_API_KEY environment variable is required");
    process.exit(1);
  }

  const documentId = process.argv[2];
  if (!documentId) {
    console.error("Error: Document ID is required");
    console.error("Usage: npx tsx examples/test-chat.ts <document-id> [question]");
    process.exit(1);
  }

  const client = new VeridoqClient({
    baseUrl,
    apiKey,
    timeoutMs: 120000, // 2 minute timeout for chat
    retry: { maxRetries: 3 },
  });

  console.log("=== Veridoq Document Chat Test ===\n");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Document ID: ${documentId}\n`);

  try {
    // Check if document exists
    console.log("Checking document...");
    const doc = await client.getDocument(documentId);
    console.log(`Document: ${doc.name}`);
    console.log(`Status: ${doc.status}`);
    
    if (doc.status !== "ready" && doc.status !== "complete") {
      console.error("\nError: Document must be in 'ready' or 'complete' status for chat");
      process.exit(1);
    }
    console.log();

    // Initial question from command line or default
    const initialQuestion = process.argv[3] || "What is this document about?";
    
    console.log(`You: ${initialQuestion}\n`);
    
    let response = await client.chat([documentId], initialQuestion);
    console.log(`Assistant: ${response.response}\n`);
    console.log(`Session ID: ${response.sessionId}\n`);

    // Interactive mode if running in terminal
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const askQuestion = () => {
        rl.question("You (q to quit): ", async (input) => {
          if (input.toLowerCase() === "q" || input.toLowerCase() === "quit") {
            console.log("\n=== Chat Ended ===");
            rl.close();
            return;
          }

          if (input.trim()) {
            try {
              console.log();
              response = await client.chat([documentId], input, response.sessionId);
              console.log(`Assistant: ${response.response}\n`);
            } catch (error) {
              if (error instanceof VeridoqError) {
                console.error(`Error: ${error.message}\n`);
              } else {
                console.error(`Error: ${error}\n`);
              }
            }
          }
          askQuestion();
        });
      };

      console.log("--- Interactive Mode ---");
      console.log("Type your questions, or 'q' to quit.\n");
      askQuestion();
    } else {
      console.log("=== Test Complete ===");
    }
  } catch (error) {
    if (error instanceof VeridoqError) {
      console.error(`\nVeridoq Error: ${error.message}`);
      console.error(`  Status: ${error.statusCode}`);
      console.error(`  Code: ${error.code}`);
    } else {
      console.error("\nError:", error);
    }
    process.exit(1);
  }
}

main();
