/**
 * Test script for document operations.
 * 
 * Usage:
 *   VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-documents.ts [pdf-path]
 */

import { VeridoqClient, waitForDocumentReady, downloadToBuffer, VeridoqError } from "../dist/index.js";
import fs from "fs";
import path from "path";

async function main() {
  const apiKey = process.env.VERIDOQ_API_KEY;
  const baseUrl = process.env.VERIDOQ_API_URL || "http://localhost:3000";

  if (!apiKey) {
    console.error("Error: VERIDOQ_API_KEY environment variable is required");
    process.exit(1);
  }

  const client = new VeridoqClient({
    baseUrl,
    apiKey,
    retry: { maxRetries: 3 },
  });

  console.log("=== Veridoq Document Operations Test ===\n");
  console.log(`Base URL: ${baseUrl}\n`);

  try {
    // 1. List existing documents
    console.log("1. Listing documents...");
    const documents = await client.listDocuments();
    console.log(`   Found ${documents.length} documents`);
    documents.slice(0, 3).forEach((doc) => {
      console.log(`   - ${doc.name} (${doc.id}) - ${doc.status}`);
    });
    console.log();

    // 2. Upload a new document (if path provided)
    const pdfPath = process.argv[2];
    if (pdfPath) {
      console.log(`2. Uploading document: ${pdfPath}`);
      const buffer = fs.readFileSync(pdfPath);
      const fileName = path.basename(pdfPath);
      
      const { documentId } = await client.uploadDocument({
        name: fileName,
        data: buffer,
      });
      console.log(`   Uploaded! Document ID: ${documentId}`);
      console.log();

      // 3. Wait for document to be ready
      console.log("3. Waiting for document processing...");
      const readyDoc = await waitForDocumentReady(client, documentId, {
        pollIntervalMs: 2000,
        maxAttempts: 60,
      });
      console.log(`   Document ready! Status: ${readyDoc.status}`);
      console.log(`   Pages: ${readyDoc.pageCount}, Chunks: ${readyDoc.chunkCount}`);
      console.log();

      // 4. Get document details
      console.log("4. Getting document details...");
      const docDetails = await client.getDocument(documentId);
      console.log(`   Name: ${docDetails.name}`);
      console.log(`   Status: ${docDetails.status}`);
      console.log(`   Created: ${docDetails.createdAt}`);
      console.log();

      // 5. Get download URL
      console.log("5. Getting download URL...");
      const { downloadUrl, expiresIn } = await client.getDocumentDownloadUrl(documentId);
      console.log(`   URL expires in: ${expiresIn} seconds`);
      console.log(`   URL: ${downloadUrl.substring(0, 80)}...`);
      console.log();

      // 6. Download document
      console.log("6. Downloading document...");
      const downloadedBuffer = await downloadToBuffer(downloadUrl);
      console.log(`   Downloaded ${downloadedBuffer.length} bytes`);
      console.log();
    } else {
      console.log("2. Skipping upload (no PDF path provided)");
      console.log("   Usage: npx tsx examples/test-documents.ts /path/to/document.pdf\n");
    }

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
