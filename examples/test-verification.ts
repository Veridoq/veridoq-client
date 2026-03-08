/**
 * Test script for verification flow.
 * 
 * Usage:
 *   VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-verification.ts <pdf-path> [template-id]
 */

import { VeridoqClient, waitForDocumentReady, waitForJobReady, VeridoqError } from "../dist/index.js";
import fs from "fs";
import path from "path";

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
    console.error("Usage: npx tsx examples/test-verification.ts <pdf-path> [template-id]");
    process.exit(1);
  }

  const client = new VeridoqClient({
    baseUrl,
    apiKey,
    timeoutMs: 60000,
    retry: { maxRetries: 5 },
  });

  console.log("=== Veridoq Verification Test ===\n");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Document: ${pdfPath}\n`);

  try {
    // 1. Get template
    let templateId = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
    
    if (!templateId) {
      console.log("1. Fetching templates...");
      const result = await client.v1ListTemplates({ type: "all" });
      const orgTemplates = result.orgTemplates || [];
      if (orgTemplates.length === 0) {
        console.error("   No org templates available. Please create a template or pass a template ID.");
        process.exit(1);
      }
      const template = orgTemplates[0];
      templateId = template.id;
      console.log(`   Using template: ${template.name} (ID: ${templateId})`);
    } else {
      console.log(`1. Using template ID: ${templateId}`);
    }
    console.log();

    // 2. Upload document
    console.log("2. Uploading document...");
    const buffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    
    const { documentId } = await client.uploadDocument({
      name: fileName,
      data: buffer,
    });
    console.log(`   Document ID: ${documentId}`);
    console.log();

    // 3. Wait for document processing
    console.log("3. Waiting for document processing...");
    const startTime = Date.now();
    await waitForDocumentReady(client, documentId, {
      pollIntervalMs: 2000,
      maxAttempts: 120,
    });
    console.log(`   Document ready (${Math.round((Date.now() - startTime) / 1000)}s)`);
    console.log();

    // 4. Start verification
    console.log("4. Starting verification...");
    const { job } = await client.verifyExistingDocument(documentId, {
      templateId: templateId!,
    });
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log();

    // 5. Wait for verification to complete
    console.log("5. Waiting for verification...");
    const verifyStart = Date.now();
    let lastProgress = -1;
    
    const completed = await waitForJobReady(client, job.id, {
      pollIntervalMs: 2000,
      maxAttempts: 180,
    });
    
    console.log(`   Verification complete (${Math.round((Date.now() - verifyStart) / 1000)}s)`);
    console.log();

    // 6. Get report
    const reportId = (completed as { reportId?: string }).reportId;
    if (reportId) {
      console.log("6. Fetching report...");
      const report = await client.getReport(reportId);
      
      console.log(`   Report ID: ${reportId}`);
      console.log(`   Document: ${(report as { documentName?: string }).documentName}`);
      
      const results = report as {
        totalCriteria?: number;
        metCount?: number;
        partiallyMetCount?: number;
        notMetCount?: number;
        insufficientEvidenceCount?: number;
        overallRisk?: string;
      };
      
      console.log(`\n   Results:`);
      console.log(`   - Total Criteria: ${results.totalCriteria || "N/A"}`);
      console.log(`   - Met: ${results.metCount || 0}`);
      console.log(`   - Partially Met: ${results.partiallyMetCount || 0}`);
      console.log(`   - Not Met: ${results.notMetCount || 0}`);
      console.log(`   - Insufficient Evidence: ${results.insufficientEvidenceCount || 0}`);
      console.log(`   - Overall Risk: ${results.overallRisk || "N/A"}`);
    } else {
      console.log("6. No report ID returned");
    }
    console.log();

    console.log("=== Test Complete ===");
  } catch (error) {
    if (error instanceof VeridoqError) {
      console.error(`\nVeridoq Error: ${error.message}`);
      console.error(`  Status: ${error.statusCode}`);
      console.error(`  Code: ${error.code}`);
      console.error(`  Retryable: ${error.retryable}`);
    } else {
      console.error("\nError:", error);
    }
    process.exit(1);
  }
}

main();
