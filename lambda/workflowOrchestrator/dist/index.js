"use strict";
// File: lambda/workflowOrchestrator/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const uuid_1 = require("uuid");
// Workflow stages - add new stages here as needed
var WorkflowStage;
(function (WorkflowStage) {
    WorkflowStage["INITIALIZING"] = "INITIALIZING";
    WorkflowStage["PROCESSING"] = "PROCESSING";
    WorkflowStage["ENRICHING"] = "ENRICHING";
    WorkflowStage["EXCLUSIONS"] = "EXCLUSIONS";
    WorkflowStage["FORMULARY_EXCLUSIONS"] = "FORMULARY_EXCLUSIONS";
    WorkflowStage["WEIGHT_LOSS_SAVINGS"] = "WEIGHT_LOSS_SAVINGS";
    WorkflowStage["DIABETES_SAVINGS"] = "DIABETES_SAVINGS";
    WorkflowStage["HDCR_SAVINGS"] = "HDCR_SAVINGS";
    WorkflowStage["PRIOR_AUTH_SAVINGS"] = "PRIOR_AUTH_SAVINGS";
    WorkflowStage["QTY_LIMIT_SAVINGS"] = "QTY_LIMIT_SAVINGS";
    WorkflowStage["CONTRACT_SAVINGS"] = "CONTRACT_SAVINGS";
    WorkflowStage["COMPLETED"] = "COMPLETED";
    WorkflowStage["ERROR"] = "ERROR";
})(WorkflowStage || (WorkflowStage = {}));
// Database config
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
};
// Lambda client
const lambdaClient = new client_lambda_1.LambdaClient();
const handler = async (event) => {
    console.log('Starting workflow orchestration with event:', JSON.stringify(event));
    const { fileId, opportunityId, action, workflowId = (0, uuid_1.v4)() } = event;
    if (!fileId || !opportunityId) {
        throw new Error('Missing required parameters: fileId and opportunityId are required.');
    }
    const client = new pg_1.Client(dbConfig);
    try {
        await client.connect();
        if (process.env.DB_SCHEMA) {
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        // Handle the action (start new workflow or check existing workflow)
        if (action === 'start') {
            // Initialize workflow
            await initializeWorkflow(client, workflowId, fileId, opportunityId);
            // Start the file processing (first stage)
            await startFileProcessing(client, workflowId, fileId, opportunityId);
            // Return workflow ID for future tracking
            return {
                statusCode: 200,
                body: {
                    message: 'Workflow initiated successfully',
                    workflowId,
                    fileId,
                    opportunityId,
                    stage: WorkflowStage.PROCESSING
                }
            };
        }
        else {
            // Check workflow status and progress next stages if needed
            const currentStatus = await checkWorkflowStatus(client, workflowId, fileId);
            // Handle each potential stage
            switch (currentStatus.stage) {
                case WorkflowStage.PROCESSING:
                    // Check if file processing is complete
                    if (await isFileProcessingComplete(client, fileId)) {
                        await updateWorkflowStage(client, workflowId, WorkflowStage.ENRICHING);
                        // Enrichment is triggered automatically by the file processor
                    }
                    break;
                case WorkflowStage.ENRICHING:
                    // Check if enrichment is complete
                    if (await isEnrichmentComplete(client, fileId)) {
                        await updateWorkflowStage(client, workflowId, WorkflowStage.EXCLUSIONS);
                        await invokeExclusionsProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.EXCLUSIONS:
                    // Check if exclusions analysis is complete
                    if (await isExclusionsComplete(client, fileId)) {
                        // Start formulary exclusions processor in "fire and forget" mode
                        await invokeFormularyExclusionsProcessorAsync(client, workflowId, fileId, opportunityId);
                        // Immediately move to weight loss savings step without waiting for formulary exclusions
                        await updateWorkflowStage(client, workflowId, WorkflowStage.WEIGHT_LOSS_SAVINGS);
                        await invokeWeightLossSavingsProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.FORMULARY_EXCLUSIONS:
                    // This stage is now skipped in normal flow, but kept for backward compatibility
                    // and to handle workflows that were started with the old process
                    if (await isFormularyExclusionsComplete(client, fileId)) {
                        // Move to weight loss savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.WEIGHT_LOSS_SAVINGS);
                        await invokeWeightLossSavingsProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.WEIGHT_LOSS_SAVINGS:
                    // Check if weight loss savings analysis is complete
                    if (await isWeightLossSavingsComplete(client, fileId)) {
                        // Move to diabetes savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.DIABETES_SAVINGS);
                        await invokeDiabetesProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.DIABETES_SAVINGS:
                    // Check if diabetes savings analysis is complete
                    if (await isDiabetesSavingsComplete(client, fileId)) {
                        // Move to HDCR savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.HDCR_SAVINGS);
                        await invokeHdcrProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.HDCR_SAVINGS:
                    // Check if HDCR savings analysis is complete
                    if (await isHdcrSavingsComplete(client, fileId)) {
                        // Move to Prior Auth savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.PRIOR_AUTH_SAVINGS);
                        await invokePriorAuthProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.PRIOR_AUTH_SAVINGS:
                    // Check if Prior Auth savings analysis is complete
                    if (await isPriorAuthSavingsComplete(client, fileId)) {
                        // Move to Quantity Limits savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.QTY_LIMIT_SAVINGS);
                        await invokeQtyLimitProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.QTY_LIMIT_SAVINGS:
                    // Check if Quantity Limits savings analysis is complete
                    if (await isQtyLimitSavingsComplete(client, fileId)) {
                        // Move to Contract Savings step
                        await updateWorkflowStage(client, workflowId, WorkflowStage.CONTRACT_SAVINGS);
                        await invokeContractSavingsProcessor(client, workflowId, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.CONTRACT_SAVINGS:
                    // Check if Contract Savings analysis is complete
                    if (await isContractSavingsComplete(client, fileId)) {
                        // Before completing the workflow, make sure formulary exclusions is complete
                        const formularyComplete = await isFormularyExclusionsComplete(client, fileId);
                        if (!formularyComplete) {
                            console.log(`Waiting for formulary exclusions to complete before finalizing workflow for file ${fileId}`);
                            // Don't mark as completed yet - will check again on next status check
                            break;
                        }
                        // If we reach here, both contract savings and formulary exclusions are complete
                        // Complete the workflow
                        await updateWorkflowStage(client, workflowId, WorkflowStage.COMPLETED);
                        // Fire financial processor as a side process when workflow is completed
                        await invokeFinancialProcessor(client, fileId, opportunityId);
                    }
                    break;
                case WorkflowStage.COMPLETED:
                    // Workflow is already complete
                    // We could trigger financial processor here again if needed for retries
                    break;
                case WorkflowStage.ERROR:
                    // Workflow is in error state, nothing to do unless retry is requested
                    if (event.retry) {
                        await handleRetry(client, workflowId, fileId, opportunityId, currentStatus);
                    }
                    break;
                default:
                    console.log(`Unknown workflow stage: ${currentStatus.stage}`);
            }
            // Return current status
            return {
                statusCode: 200,
                body: {
                    message: 'Workflow status checked',
                    workflowId,
                    fileId,
                    opportunityId,
                    stage: currentStatus.stage,
                    progress: currentStatus.progress,
                    details: currentStatus.details
                }
            };
        }
    }
    catch (error) {
        console.error('Error during workflow orchestration:', error);
        // Update workflow status to ERROR if we have a workflowId
        if (workflowId) {
            try {
                await updateWorkflowError(client, workflowId, error);
            }
            catch (updateError) {
                console.error('Error updating workflow error status:', updateError);
            }
        }
        return {
            statusCode: 500,
            body: {
                message: 'Workflow orchestration failed',
                error: error instanceof Error ? error.message : String(error)
            }
        };
    }
    finally {
        try {
            await client.end();
        }
        catch (e) {
            console.error('Error closing client:', e);
        }
    }
};
exports.handler = handler;
/**
 * Initialize a new workflow tracking record
 */
async function initializeWorkflow(client, workflowId, fileId, opportunityId) {
    const query = `
    INSERT INTO workflow_tracking (
      workflow_id, file_id, opportunity_id, stage, started_at, 
      details, created_by, created_at
    ) VALUES (
      $1, $2, $3, $4, CURRENT_TIMESTAMP, 
      $5, 'workflow-orchestrator', CURRENT_TIMESTAMP
    )
  `;
    await client.query(query, [
        workflowId,
        fileId,
        opportunityId,
        WorkflowStage.INITIALIZING,
        JSON.stringify({
            stages: {
                [WorkflowStage.INITIALIZING]: { status: 'completed', timestamp: new Date().toISOString() },
                [WorkflowStage.PROCESSING]: { status: 'pending' },
                [WorkflowStage.ENRICHING]: { status: 'pending' },
                [WorkflowStage.EXCLUSIONS]: { status: 'pending' },
                [WorkflowStage.FORMULARY_EXCLUSIONS]: { status: 'pending' },
                [WorkflowStage.WEIGHT_LOSS_SAVINGS]: { status: 'pending' },
                [WorkflowStage.DIABETES_SAVINGS]: { status: 'pending' },
                [WorkflowStage.HDCR_SAVINGS]: { status: 'pending' },
                [WorkflowStage.PRIOR_AUTH_SAVINGS]: { status: 'pending' },
                [WorkflowStage.QTY_LIMIT_SAVINGS]: { status: 'pending' },
                [WorkflowStage.CONTRACT_SAVINGS]: { status: 'pending' }
                // Additional stages can be added here
            }
        })
    ]);
}
/**
 * Start the file processing stage
 */
async function startFileProcessing(client, workflowId, fileId, opportunityId) {
    // Update workflow status
    await updateWorkflowStage(client, workflowId, WorkflowStage.PROCESSING);
    try {
        console.log(`Starting file processing for file ${fileId}`);
        // Get file S3 location from the registry
        const fileQuery = `
      SELECT s3_location, row_count
      FROM claims_file_registry
      WHERE file_id = $1
    `;
        const fileResult = await client.query(fileQuery, [fileId]);
        if (fileResult.rows.length === 0) {
            throw new Error(`File ${fileId} not found in registry`);
        }
        const s3Location = fileResult.rows[0].s3_location;
        const rowCount = fileResult.rows[0].row_count;
        // Create processing history entry directly in the database
        const processingId = (0, uuid_1.v4)();
        // Insert processing record
        await client.query(`
      INSERT INTO claim_processing_history (
        processing_id, file_id, start_time, status, 
        total_rows, processed_rows, created_by
      ) VALUES (
        $1, $2, CURRENT_TIMESTAMP, 'PROCESSING', 
        $3, 0, 'workflow-orchestrator'
      )
    `, [processingId, fileId, rowCount]);
        // Update file status
        await client.query(`
      UPDATE claims_file_registry
      SET 
        status = 'PROCESSING_CLAIMS',
        processing_stage = 'PROCESSING_CLAIMS',
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'workflow-orchestrator'
      WHERE file_id = $1
    `, [fileId]);
        // Now call the fileProcessor Lambda with EXACTLY the required parameters - no extras
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: 'fileProcessor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                processingId,
                s3Location
            })
        });
        console.log(`Invoking fileProcessor with parameters: ${JSON.stringify({
            fileId,
            processingId,
            s3Location
        })}`);
        await lambdaClient.send(command);
        console.log(`Successfully invoked fileProcessor Lambda for file ${fileId}`);
    }
    catch (error) {
        console.error(`Error starting file processing: ${error}`);
        throw error;
    }
}
/**
 * Check the current workflow status
 */
async function checkWorkflowStatus(client, workflowId, fileId) {
    const query = `
    SELECT 
      workflow_id, file_id, opportunity_id, stage, 
      started_at, completed_at, details
    FROM workflow_tracking
    WHERE workflow_id = $1
  `;
    const result = await client.query(query, [workflowId]);
    if (result.rows.length === 0) {
        throw new Error(`Workflow with ID ${workflowId} not found`);
    }
    const workflow = result.rows[0];
    // Calculate progress based on current stage and file/batch status
    let progress = await calculateProgress(client, fileId, workflow.stage);
    return {
        stage: workflow.stage,
        progress,
        details: workflow.details
    };
}
/**
 * Calculate progress percentage based on current stage and database status
 */
async function calculateProgress(client, fileId, stage) {
    let progress = 0;
    switch (stage) {
        case WorkflowStage.PROCESSING:
            // Calculate file processing progress - check both the file registry and processing history
            // First check if the file is in PROCESSING_CLAIMS status
            const fileStatusResult = await client.query(`
        SELECT status, row_count
        FROM claims_file_registry
        WHERE file_id = $1
      `, [fileId]);
            // Check processing history for current progress
            const processingResult = await client.query(`
        SELECT 
          total_rows,
          processed_rows,
          status
        FROM claim_processing_history
        WHERE file_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [fileId]);
            if (processingResult.rows.length > 0) {
                const { total_rows, processed_rows, status } = processingResult.rows[0];
                // If status is COMPLETED, set progress to 100%
                if (status === 'COMPLETED') {
                    progress = 100;
                    console.log(`Processing is complete for file ${fileId}`);
                }
                // Otherwise calculate based on rows
                else if (parseInt(total_rows) > 0) {
                    progress = (parseInt(processed_rows) / parseInt(total_rows)) * 100;
                    console.log(`Processing progress for file ${fileId}: ${progress.toFixed(2)}%`);
                }
            }
            break;
        case WorkflowStage.ENRICHING:
            // Calculate enrichment progress by checking batch status
            const batchResult = await client.query(`
        SELECT 
          COUNT(*) as total_batches,
          SUM(CASE WHEN enrichment_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_batches
        FROM batch_processing_status
        WHERE file_id = $1
      `, [fileId]);
            if (batchResult.rows.length > 0) {
                const { total_batches, completed_batches } = batchResult.rows[0];
                if (parseInt(total_batches) > 0) {
                    progress = (parseInt(completed_batches) / parseInt(total_batches)) * 100;
                }
            }
            break;
        case WorkflowStage.EXCLUSIONS:
            // For now, exclusions is either 0% or 100%
            // We could enhance this later with more granular progress
            progress = await isExclusionsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.FORMULARY_EXCLUSIONS:
            // For now, formulary exclusions is either 0% or 100%
            progress = await isFormularyExclusionsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.WEIGHT_LOSS_SAVINGS:
            // Weight loss savings analysis progress
            progress = await isWeightLossSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.DIABETES_SAVINGS:
            // Diabetes savings analysis progress
            progress = await isDiabetesSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.HDCR_SAVINGS:
            // HDCR savings analysis progress
            progress = await isHdcrSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.PRIOR_AUTH_SAVINGS:
            // Prior Auth savings analysis progress
            progress = await isPriorAuthSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.QTY_LIMIT_SAVINGS:
            // Quantity Limits savings analysis progress
            progress = await isQtyLimitSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.CONTRACT_SAVINGS:
            // Contract Savings analysis progress
            progress = await isContractSavingsComplete(client, fileId) ? 100 : 50;
            break;
        case WorkflowStage.COMPLETED:
            progress = 100;
            break;
        case WorkflowStage.ERROR:
            // Keep the last known progress
            break;
        default:
            progress = 0;
    }
    // Ensure progress is a valid number between 0-100
    if (isNaN(progress)) {
        console.log(`Progress calculation resulted in NaN for stage ${stage}, defaulting to 0`);
        progress = 0;
    }
    return Math.min(Math.max(progress, 0), 100);
}
/**
 * Update the workflow stage
 */
async function updateWorkflowStage(client, workflowId, newStage) {
    // Get current details
    const currentQuery = `
    SELECT details
    FROM workflow_tracking
    WHERE workflow_id = $1
  `;
    const currentResult = await client.query(currentQuery, [workflowId]);
    if (currentResult.rows.length === 0) {
        throw new Error(`Workflow with ID ${workflowId} not found`);
    }
    const currentDetails = currentResult.rows[0].details || { stages: {} };
    // Update details with new stage info
    const updatedDetails = {
        ...currentDetails,
        stages: {
            ...currentDetails.stages,
            [newStage]: {
                status: 'in_progress',
                timestamp: new Date().toISOString()
            }
        }
    };
    // If moving to a new stage, mark the previous stage as completed
    if (currentResult.rows[0].stage && currentResult.rows[0].stage !== newStage) {
        const prevStage = currentResult.rows[0].stage;
        updatedDetails.stages[prevStage] = {
            ...updatedDetails.stages[prevStage],
            status: 'completed',
            completedAt: new Date().toISOString()
        };
    }
    // Update the workflow record
    const updateQuery = `
    UPDATE workflow_tracking
    SET 
      stage = $1,
      details = $2,
      ${newStage === WorkflowStage.COMPLETED ? 'completed_at = CURRENT_TIMESTAMP,' : ''}
      updated_at = CURRENT_TIMESTAMP,
      updated_by = 'workflow-orchestrator'
    WHERE workflow_id = $3
  `;
    await client.query(updateQuery, [
        newStage,
        JSON.stringify(updatedDetails),
        workflowId
    ]);
    console.log(`Updated workflow ${workflowId} to stage ${newStage}`);
}
/**
 * Check if file processing is complete
 */
async function isFileProcessingComplete(client, fileId) {
    try {
        console.log(`Checking if file processing is complete for file ${fileId}`);
        // First check the claims_file_registry table for the current status
        const fileStatusQuery = `
      SELECT status, processing_stage
      FROM claims_file_registry
      WHERE file_id = $1
    `;
        const fileStatusResult = await client.query(fileStatusQuery, [fileId]);
        if (fileStatusResult.rows.length === 0) {
            console.log(`File ${fileId} not found in registry`);
            return false;
        }
        console.log(`File ${fileId} registry status: ${JSON.stringify(fileStatusResult.rows[0])}`);
        // If status is PROCESSED, file processing is complete
        if (fileStatusResult.rows[0].status === 'PROCESSED') {
            console.log(`File ${fileId} is in PROCESSED status, file processing complete`);
            return true;
        }
        // Get a record count from claim_records to see if data has been inserted
        const claimsQuery = `
      SELECT COUNT(*) as record_count
      FROM claim_records
      WHERE file_id = $1
    `;
        const claimsResult = await client.query(claimsQuery, [fileId]);
        const recordCount = parseInt(claimsResult.rows[0].record_count);
        console.log(`File ${fileId} has ${recordCount} claim records`);
        // If we have claim records, check the claim_processing_history
        if (recordCount > 0) {
            const historyQuery = `
        SELECT 
          status, 
          total_rows, 
          processed_rows,
          CASE 
            WHEN total_rows = 0 THEN 0
            ELSE (processed_rows::float / total_rows::float) * 100 
          END as progress
        FROM claim_processing_history
        WHERE file_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const historyResult = await client.query(historyQuery, [fileId]);
            if (historyResult.rows.length > 0) {
                const { status, total_rows, processed_rows, progress } = historyResult.rows[0];
                console.log(`File ${fileId} processing history status: ${status}, progress: ${progress}%`);
                // File is processed if history status is COMPLETED or if all rows have been processed
                if (status === 'COMPLETED') {
                    console.log(`File ${fileId} processing history status is COMPLETED`);
                    return true;
                }
                if (parseInt(processed_rows) > 0 && parseInt(processed_rows) >= parseInt(total_rows)) {
                    console.log(`File ${fileId} has processed all rows (${processed_rows}/${total_rows})`);
                    return true;
                }
            }
        }
        return false;
    }
    catch (error) {
        console.error(`Error checking file processing completion: ${error}`);
        return false;
    }
}
/**
 * Check if enrichment is complete
 */
async function isEnrichmentComplete(client, fileId) {
    const query = `
    SELECT 
      COUNT(*) as total_batches,
      SUM(CASE WHEN enrichment_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_batches,
      SUM(CASE WHEN enrichment_status = 'ERROR' THEN 1 ELSE 0 END) as error_batches
    FROM batch_processing_status
    WHERE file_id = $1
  `;
    const result = await client.query(query, [fileId]);
    if (result.rows.length === 0 || parseInt(result.rows[0].total_batches) === 0) {
        return false;
    }
    const { total_batches, completed_batches, error_batches } = result.rows[0];
    // All batches are either completed or in error
    return parseInt(completed_batches) + parseInt(error_batches) === parseInt(total_batches) &&
        parseInt(completed_batches) > 0;
}
/**
 * Invoke the exclusions processor
 */
async function invokeExclusionsProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if exclusions have already been processed (look for 'plans' category)
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'plans'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Exclusions analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke exclusions processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked exclusions processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking exclusions processor: ${error}`);
        throw error;
    }
}
/**
 * Check if exclusions analysis is complete
 */
async function isExclusionsComplete(client, fileId) {
    try {
        console.log(`Checking if exclusions analysis is complete for file ${fileId}`);
        // Check for 'plans' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'plans'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} plans records for file ${fileId}`);
        // Simple check - if we have records with category 'plans', exclusions is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking exclusions completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the formulary exclusions processor - original function kept for backward compatibility
 */
async function invokeFormularyExclusionsProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if formulary exclusions have already been processed (look for 'formulary' category)
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'formulary'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Formulary exclusions analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke formulary exclusions processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.FORMULARY_EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'formulary-exclusions-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked formulary exclusions processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking formulary exclusions processor: ${error}`);
        throw error;
    }
}
/**
 * Invoke the formulary exclusions processor asynchronously (fire and forget)
 * Does not update workflow stage - allows subsequent processors to start immediately
 */
async function invokeFormularyExclusionsProcessorAsync(client, workflowId, fileId, opportunityId) {
    try {
        // Check if formulary exclusions have already been processed (look for 'formulary' category)
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'formulary'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Formulary exclusions analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke formulary exclusions processor asynchronously for file ${fileId}, opportunity ${opportunityId}`);
        // Track the formulary exclusions processing in the workflow details
        // but don't change the main workflow stage
        const currentQuery = `
      SELECT details
      FROM workflow_tracking
      WHERE workflow_id = $1
    `;
        const currentResult = await client.query(currentQuery, [workflowId]);
        if (currentResult.rows.length > 0) {
            const currentDetails = currentResult.rows[0].details || { stages: {} };
            // Update details to mark formulary exclusions as in_progress
            const updatedDetails = {
                ...currentDetails,
                stages: {
                    ...currentDetails.stages,
                    [WorkflowStage.FORMULARY_EXCLUSIONS]: {
                        status: 'in_progress',
                        timestamp: new Date().toISOString(),
                        async: true
                    }
                }
            };
            // Update the workflow record details without changing the stage
            const updateQuery = `
        UPDATE workflow_tracking
        SET 
          details = $1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'workflow-orchestrator'
        WHERE workflow_id = $2
      `;
            await client.query(updateQuery, [
                JSON.stringify(updatedDetails),
                workflowId
            ]);
        }
        // Fire and forget invocation
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.FORMULARY_EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'formulary-exclusions-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked formulary exclusions processor asynchronously for file ${fileId}`);
    }
    catch (error) {
        console.error(`Error invoking formulary exclusions processor asynchronously: ${error}`);
        // Log error but don't throw - we want the workflow to continue even if this fails
    }
}
/**
 * Check if formulary exclusions analysis is complete
 */
async function isFormularyExclusionsComplete(client, fileId) {
    try {
        console.log(`Checking if formulary exclusions analysis is complete for file ${fileId}`);
        // Check for 'formulary' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'formulary'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} formulary records for file ${fileId}`);
        // Simple check - if we have records with category 'formulary', formulary exclusions is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking formulary exclusions completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the weight loss savings processor
 */
async function invokeWeightLossSavingsProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if weight loss savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'P1_GLP1_Wght_Loss'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Weight loss savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke weight loss savings processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.WEIGHT_LOSS_SAVINGS_PROCESSOR_LAMBDA_NAME || 'weight-loss-savings-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked weight loss savings processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking weight loss savings processor: ${error}`);
        throw error;
    }
}
/**
 * Check if weight loss savings analysis is complete
 */
async function isWeightLossSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if weight loss savings analysis is complete for file ${fileId}`);
        // Check for 'P1_GLP1_Wght_Loss' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'P1_GLP1_Wght_Loss'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} weight loss savings records for file ${fileId}`);
        // Simple check - if we have records with category 'P1_GLP1_Wght_Loss', weight loss savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking weight loss savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the diabetes processor
 */
async function invokeDiabetesProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if diabetes savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'P1_GLP1_Diabetes'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Diabetes savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke diabetes processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.DIABETES_PROCESSOR_LAMBDA_NAME || 'diabetes-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked diabetes processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking diabetes processor: ${error}`);
        throw error;
    }
}
/**
 * Check if diabetes savings analysis is complete
 */
async function isDiabetesSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if diabetes savings analysis is complete for file ${fileId}`);
        // Check for 'P1_GLP1_Diabetes' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'P1_GLP1_Diabetes'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} diabetes savings records for file ${fileId}`);
        // Simple check - if we have records with category 'P1_GLP1_Diabetes', diabetes savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking diabetes savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the HDCR processor
 */
async function invokeHdcrProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if HDCR savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'hdcr'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`HDCR savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke HDCR processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.HDCR_PROCESSOR_LAMBDA_NAME || 'hdcr-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked HDCR processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking HDCR processor: ${error}`);
        throw error;
    }
}
/**
 * Check if HDCR savings analysis is complete
 */
async function isHdcrSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if HDCR savings analysis is complete for file ${fileId}`);
        // Check for 'hdcr' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'hdcr'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} HDCR savings records for file ${fileId}`);
        // Simple check - if we have records with category 'hdcr', HDCR savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking HDCR savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the Prior Auth processor
 */
async function invokePriorAuthProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if Prior Auth savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'priorauth'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Prior Auth savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke Prior Auth processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.PRIOR_AUTH_PROCESSOR_LAMBDA_NAME || 'prior-auth-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked Prior Auth processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking Prior Auth processor: ${error}`);
        throw error;
    }
}
/**
 * Check if Prior Auth savings analysis is complete
 */
async function isPriorAuthSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if Prior Auth savings analysis is complete for file ${fileId}`);
        // Check for 'priorauth' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'priorauth'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} Prior Auth savings records for file ${fileId}`);
        // Simple check - if we have records with category 'priorauth', Prior Auth savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking Prior Auth savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the Quantity Limits processor
 */
async function invokeQtyLimitProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if Quantity Limits savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'qtylim'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Quantity Limits savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke Quantity Limits processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.QTY_LIMIT_PROCESSOR_LAMBDA_NAME || 'qty-limit-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked Quantity Limits processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking Quantity Limits processor: ${error}`);
        throw error;
    }
}
/**
 * Check if Quantity Limits savings analysis is complete
 */
async function isQtyLimitSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if Quantity Limits savings analysis is complete for file ${fileId}`);
        // Check for 'qtylim' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'qtylim'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} Quantity Limits savings records for file ${fileId}`);
        // Simple check - if we have records with category 'qtylim', Quantity Limits savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking Quantity Limits savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the Contract Savings processor
 */
async function invokeContractSavingsProcessor(client, workflowId, fileId, opportunityId) {
    try {
        // Check if Contract Savings have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'contractSavings'
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Contract Savings analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke Contract Savings processor for file ${fileId}, opportunity ${opportunityId}`);
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.CONTRACT_SAVINGS_PROCESSOR_LAMBDA_NAME || 'contract-savings-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId,
                workflowId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked Contract Savings processor for file ${fileId}`);
        // Increase throttling time to prevent multiple invocations
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    catch (error) {
        console.error(`Error invoking Contract Savings processor: ${error}`);
        throw error;
    }
}
/**
 * Check if Contract Savings analysis is complete
 */
async function isContractSavingsComplete(client, fileId) {
    try {
        console.log(`Checking if Contract Savings analysis is complete for file ${fileId}`);
        // Check for 'contractSavings' category
        const query = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND category = 'contractSavings'
    `;
        const result = await client.query(query, [fileId]);
        const count = parseInt(result.rows[0].count);
        console.log(`Found ${count} Contract Savings records for file ${fileId}`);
        // Simple check - if we have records with category 'contractSavings', Contract Savings is complete
        return count > 0;
    }
    catch (error) {
        console.error(`Error checking Contract Savings completion: ${error}`);
        return false;
    }
}
/**
 * Invoke the Financial processor - fire and forget
 */
async function invokeFinancialProcessor(client, fileId, opportunityId) {
    try {
        // Check if Financial analysis have already been processed
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM savings_results
      WHERE file_id = $1 AND (category = 'fcHDHP' OR category = 'fcACA')
    `;
        const checkResult = await client.query(checkQuery, [fileId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log(`Financial analysis already completed for file ${fileId}, skipping invocation`);
            return;
        }
        console.log(`Preparing to invoke Financial processor for file ${fileId}, opportunity ${opportunityId}`);
        // Fire and forget - no workflowId needed
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: process.env.FINANCIAL_PROCESSOR_LAMBDA_NAME || 'financial-processor',
            InvocationType: 'Event',
            Payload: JSON.stringify({
                fileId,
                opportunityId
            })
        });
        await lambdaClient.send(command);
        console.log(`Successfully invoked Financial processor for file ${fileId} (fire and forget)`);
    }
    catch (error) {
        console.error(`Error invoking Financial processor: ${error}`);
        // Don't throw the error since this is a side process
        // Just log it and continue
    }
}
/**
 * Update workflow error status
 */
async function updateWorkflowError(client, workflowId, error) {
    const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        stack: error instanceof Error ? error.stack : undefined
    };
    const query = `
    UPDATE workflow_tracking
    SET 
      stage = $1,
      details = jsonb_set(details, '{error}', $2, true),
      updated_at = CURRENT_TIMESTAMP,
      updated_by = 'workflow-orchestrator'
    WHERE workflow_id = $3
  `;
    await client.query(query, [
        WorkflowStage.ERROR,
        JSON.stringify(errorDetails),
        workflowId
    ]);
}
/**
 * Handle retry request for a workflow in error state
 */
async function handleRetry(client, workflowId, fileId, opportunityId, currentStatus) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // Get the last successful stage
    let lastSuccessfulStage = WorkflowStage.INITIALIZING;
    const stages = ((_a = currentStatus.details) === null || _a === void 0 ? void 0 : _a.stages) || {};
    if (((_b = stages[WorkflowStage.PROCESSING]) === null || _b === void 0 ? void 0 : _b.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.PROCESSING;
    if (((_c = stages[WorkflowStage.ENRICHING]) === null || _c === void 0 ? void 0 : _c.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.ENRICHING;
    if (((_d = stages[WorkflowStage.EXCLUSIONS]) === null || _d === void 0 ? void 0 : _d.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.EXCLUSIONS;
    if (((_e = stages[WorkflowStage.FORMULARY_EXCLUSIONS]) === null || _e === void 0 ? void 0 : _e.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.FORMULARY_EXCLUSIONS;
    if (((_f = stages[WorkflowStage.WEIGHT_LOSS_SAVINGS]) === null || _f === void 0 ? void 0 : _f.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.WEIGHT_LOSS_SAVINGS;
    if (((_g = stages[WorkflowStage.DIABETES_SAVINGS]) === null || _g === void 0 ? void 0 : _g.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.DIABETES_SAVINGS;
    if (((_h = stages[WorkflowStage.HDCR_SAVINGS]) === null || _h === void 0 ? void 0 : _h.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.HDCR_SAVINGS;
    if (((_j = stages[WorkflowStage.PRIOR_AUTH_SAVINGS]) === null || _j === void 0 ? void 0 : _j.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.PRIOR_AUTH_SAVINGS;
    if (((_k = stages[WorkflowStage.QTY_LIMIT_SAVINGS]) === null || _k === void 0 ? void 0 : _k.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.QTY_LIMIT_SAVINGS;
    if (((_l = stages[WorkflowStage.CONTRACT_SAVINGS]) === null || _l === void 0 ? void 0 : _l.status) === 'completed')
        lastSuccessfulStage = WorkflowStage.CONTRACT_SAVINGS;
    // Determine which stage to retry from
    let nextStage;
    switch (lastSuccessfulStage) {
        case WorkflowStage.INITIALIZING:
            nextStage = WorkflowStage.PROCESSING;
            await startFileProcessing(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.PROCESSING:
            nextStage = WorkflowStage.ENRICHING;
            // Enrichment is triggered by file processor
            break;
        case WorkflowStage.ENRICHING:
            nextStage = WorkflowStage.EXCLUSIONS;
            await invokeExclusionsProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.EXCLUSIONS:
            nextStage = WorkflowStage.FORMULARY_EXCLUSIONS;
            await invokeFormularyExclusionsProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.FORMULARY_EXCLUSIONS:
            nextStage = WorkflowStage.WEIGHT_LOSS_SAVINGS;
            await invokeWeightLossSavingsProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.WEIGHT_LOSS_SAVINGS:
            nextStage = WorkflowStage.DIABETES_SAVINGS;
            await invokeDiabetesProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.DIABETES_SAVINGS:
            nextStage = WorkflowStage.HDCR_SAVINGS;
            await invokeHdcrProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.HDCR_SAVINGS:
            nextStage = WorkflowStage.PRIOR_AUTH_SAVINGS;
            await invokePriorAuthProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.PRIOR_AUTH_SAVINGS:
            nextStage = WorkflowStage.QTY_LIMIT_SAVINGS;
            await invokeQtyLimitProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.QTY_LIMIT_SAVINGS:
            nextStage = WorkflowStage.CONTRACT_SAVINGS;
            await invokeContractSavingsProcessor(client, workflowId, fileId, opportunityId);
            break;
        case WorkflowStage.CONTRACT_SAVINGS:
            nextStage = WorkflowStage.COMPLETED;
            // Fire financial processor as a side process (fire and forget)
            await invokeFinancialProcessor(client, fileId, opportunityId);
            break;
        default:
            nextStage = WorkflowStage.ERROR;
            console.log(`Cannot retry from unknown stage: ${lastSuccessfulStage}`);
    }
    // Update workflow to the next stage
    if (nextStage) {
        await updateWorkflowStage(client, workflowId, nextStage);
    }
}
