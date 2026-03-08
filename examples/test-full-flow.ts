/**
 * Complete end-to-end test script demonstrating all SDK features.
 * 
 * Usage:
 *   VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-full-flow.ts <pdf-path>
 */

import { 
  VeridoqClient, 
  waitForDocumentReady, 
  waitForJobReady, 
  downloadToBuffer,
  VeridoqError 
} from "../dist/index.js";
import fs from "fs";
import path from "path";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

async function main() {
  const apiKey = process.env.VERIDOQ_API_KEY;
  const baseUrl = process.env.VERIDOQ_API_URL || "http://localhost:3000";

  if (!apiKey) {
    console.error("Error: VERIDOQ_API_KEY environment variable is required");
    process.exit(1);
  }

  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Error: PDF path is required");
    console.error("Usage: npx tsx examples/test-full-flow.ts <pdf-path>");
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  const client = new VeridoqClient({
    baseUrl,
    apiKey,
    timeoutMs: 120000,
    retry: {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
  });

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Veridoq SDK Complete Flow Test                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`Configuration:`);
  console.log(`  Base URL:   ${baseUrl}`);
  console.log(`  Document:   ${path.basename(pdfPath)}`);
  console.log(`  File Size:  ${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB\n`);

  const startTime = Date.now();

  try {
    // ═══════════════════════════════════════════════════════════════
    // Step 1: List Templates
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 1: List Templates                                      │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const result = await client.v1ListTemplates({ type: "all" });
    const orgTemplates = result.orgTemplates || [];
    const globalCount = result.globalTemplates?.count || 0;
    const sharedCount = result.sharedTemplates?.count || 0;
    console.log(`  Global: ${globalCount}, Shared: ${sharedCount}, Org: ${orgTemplates.length}`);
    orgTemplates.slice(0, 5).forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.name} (ID: ${t.id}, ${t.criteriaCount || "?"} criteria)`);
    });
    if (orgTemplates.length > 5) {
      console.log(`    ... and ${orgTemplates.length - 5} more`);
    }

    if (orgTemplates.length === 0 && globalCount === 0) {
      console.error("\n  Error: No templates available. Please create a template first.");
      process.exit(1);
    }

    // Use the first org template, or fall back to fetching a specific global template
    const template = orgTemplates[0];
    if (!template) {
      console.error("\n  Error: No org templates available to select for verification.");
      console.error("  Pass a template ID as an argument, or create an org template first.");
      process.exit(1);
    }
    console.log(`\n  Selected: "${template.name}" for verification\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Upload Document
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 2: Upload Document                                     │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const uploadStart = Date.now();
    const buffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    
    const { documentId } = await client.uploadDocument({
      name: fileName,
      data: buffer,
    });
    
    console.log(`  Document ID: ${documentId}`);
    console.log(`  Upload time: ${formatDuration(Date.now() - uploadStart)}\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Wait for Document Processing
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 3: Document Processing                                 │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const processStart = Date.now();
    process.stdout.write("  Processing");
    
    let dots = 0;
    const progressInterval = setInterval(() => {
      process.stdout.write(".");
      dots++;
      if (dots % 30 === 0) {
        process.stdout.write(`\n  Processing`);
      }
    }, 1000);
    
    const readyDoc = await waitForDocumentReady(client, documentId, {
      pollIntervalMs: 2000,
      maxAttempts: 120,
    });
    
    clearInterval(progressInterval);
    console.log(" Done!");
    console.log(`  Status: ${readyDoc.status}`);
    console.log(`  Pages: ${readyDoc.pageCount}, Chunks: ${readyDoc.chunkCount}`);
    console.log(`  Processing time: ${formatDuration(Date.now() - processStart)}\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Start Verification
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 4: Start Verification                                  │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const { job } = await client.verifyExistingDocument(documentId, {
      templateId: template.id,
    });
    
    console.log(`  Job ID: ${job.id}`);
    console.log(`  Template: ${template.name}\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 5: Wait for Verification
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 5: Verification Progress                               │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const verifyStart = Date.now();
    process.stdout.write("  Verifying");
    
    const verifyInterval = setInterval(() => {
      process.stdout.write(".");
    }, 1000);
    
    const completed = await waitForJobReady(client, job.id, {
      pollIntervalMs: 2000,
      maxAttempts: 180,
    });
    
    clearInterval(verifyInterval);
    console.log(" Done!");
    console.log(`  Verification time: ${formatDuration(Date.now() - verifyStart)}\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 6: Get Report
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 6: Verification Report                                 │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const reportId = (completed as { reportId?: string }).reportId;
    if (reportId) {
      const report = await client.getReport(reportId);
      
      const results = report as {
        documentName?: string;
        totalCriteria?: number;
        metCount?: number;
        partiallyMetCount?: number;
        notMetCount?: number;
        insufficientEvidenceCount?: number;
        overallRisk?: string;
        overallConfidence?: number;
      };
      
      console.log(`  Report ID: ${reportId}`);
      console.log(`  Document: ${results.documentName}`);
      console.log(`\n  Results Summary:`);
      console.log(`  ┌──────────────────────┬────────┐`);
      console.log(`  │ Criteria             │ Count  │`);
      console.log(`  ├──────────────────────┼────────┤`);
      console.log(`  │ Total                │ ${String(results.totalCriteria || 0).padStart(6)} │`);
      console.log(`  │ Met                  │ ${String(results.metCount || 0).padStart(6)} │`);
      console.log(`  │ Partially Met        │ ${String(results.partiallyMetCount || 0).padStart(6)} │`);
      console.log(`  │ Not Met              │ ${String(results.notMetCount || 0).padStart(6)} │`);
      console.log(`  │ Insufficient Evidence│ ${String(results.insufficientEvidenceCount || 0).padStart(6)} │`);
      console.log(`  └──────────────────────┴────────┘`);
      console.log(`\n  Overall Risk: ${results.overallRisk || "N/A"}`);
      if (results.overallConfidence !== undefined) {
        console.log(`  Confidence: ${(results.overallConfidence * 100).toFixed(1)}%`);
      }
    } else {
      console.log("  No report generated");
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 7: Document Chat
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 7: Document Chat                                       │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const chatStart = Date.now();
    const question = "What is the main purpose of this document? Give a brief summary.";
    console.log(`  Question: "${question}"\n`);
    
    const chatResponse = await client.chat([documentId], question);
    
    console.log(`  Response:\n`);
    const responseLines = chatResponse.response.split("\n");
    responseLines.forEach(line => {
      console.log(`    ${line}`);
    });
    console.log(`\n  Session ID: ${chatResponse.sessionId}`);
    console.log(`  Chat time: ${formatDuration(Date.now() - chatStart)}\n`);

    // ═══════════════════════════════════════════════════════════════
    // Step 8: Download Document
    // ═══════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│ Step 8: Download Document                                   │");
    console.log("└─────────────────────────────────────────────────────────────┘");
    
    const { downloadUrl, expiresIn } = await client.getDocumentDownloadUrl(documentId);
    console.log(`  Download URL generated (expires in ${expiresIn}s)`);
    
    const downloadedBuffer = await downloadToBuffer(downloadUrl);
    console.log(`  Downloaded ${(downloadedBuffer.length / 1024).toFixed(1)} KB\n`);

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    Test Complete                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\n  Total time: ${formatDuration(Date.now() - startTime)}`);
    console.log(`  Document ID: ${documentId}`);
    if (reportId) {
      console.log(`  Report ID: ${reportId}`);
    }
    console.log();
    
  } catch (error) {
    if (error instanceof VeridoqError) {
      console.error(`\n╔════════════════════════════════════════════════════════════╗`);
      console.error(`║                       ERROR                                  ║`);
      console.error(`╚════════════════════════════════════════════════════════════╝`);
      console.error(`\n  Message: ${error.message}`);
      console.error(`  Status Code: ${error.statusCode || "N/A"}`);
      console.error(`  Error Code: ${error.code || "N/A"}`);
      console.error(`  Retryable: ${error.retryable ? "Yes" : "No"}`);
    } else {
      console.error("\nUnexpected Error:", error);
    }
    process.exit(1);
  }
}

main();
