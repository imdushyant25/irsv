// File: src/app/api/files/workflow/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { invokeLambda } from '@/lib/aws/lambda';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, opportunityId, workflowId, action, retry } = body;

    if (!fileId || !opportunityId) {
      return NextResponse.json(
        { error: 'Missing required parameters: fileId and opportunityId are required' },
        { status: 400 }
      );
    }

    // Check if the file exists
    const fileExistsResult = await query(`
      SELECT file_id, status
      FROM claims_file_registry
      WHERE file_id = $1
    `, [fileId]);

    if (fileExistsResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Handle start action
    if (action === 'start') {
      // Check if there's already an active workflow for this file
      const existingWorkflowResult = await query(`
        SELECT workflow_id, stage
        FROM workflow_tracking
        WHERE file_id = $1 AND stage NOT IN ('COMPLETED', 'ERROR')
        ORDER BY created_at DESC
        LIMIT 1
      `, [fileId]);

      // If there's an active workflow, return it
      if (existingWorkflowResult.rows.length > 0) {
        const existingWorkflow = existingWorkflowResult.rows[0];
        return NextResponse.json({
          message: 'Workflow already in progress',
          workflowId: existingWorkflow.workflow_id,
          stage: existingWorkflow.stage
        });
      }

      // Start a new workflow by invoking the orchestrator Lambda
      const newWorkflowId = workflowId || uuidv4();
      
      await invokeLambda(
        process.env.WORKFLOW_ORCHESTRATOR_LAMBDA_NAME || 'workflow-orchestrator',
        {
          fileId,
          opportunityId,
          action: 'start',
          workflowId: newWorkflowId
        },
        'RequestResponse' // Synchronous invocation for immediate response
      );

      return NextResponse.json({
        message: 'Workflow initiated successfully',
        workflowId: newWorkflowId,
        fileId,
        opportunityId
      });
    }
    // Handle status check or retry
    else if (action === 'status') {
      if (!workflowId) {
        return NextResponse.json(
          { error: 'Missing required parameter: workflowId is required for status check' },
          { status: 400 }
        );
      }

      // Get the latest workflow status from the database
      const workflowResult = await query(`
        SELECT 
          workflow_id, 
          file_id, 
          opportunity_id, 
          stage, 
          started_at,
          completed_at,
          details
        FROM workflow_tracking
        WHERE workflow_id = $1
      `, [workflowId]);

      if (workflowResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      const workflow = workflowResult.rows[0];

      // Get stage-specific progress if available
      let progress = 0;

      // Calculate progress based on current stage and database status
      if (workflow.stage === 'PROCESSING') {
        // Check processing progress
        const processingResult = await query(`
          SELECT 
            total_rows,
            processed_rows
          FROM claim_processing_history
          WHERE file_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [fileId]);
        
        if (processingResult.rows.length > 0) {
          const { total_rows, processed_rows } = processingResult.rows[0];
          progress = (parseInt(processed_rows) / parseInt(total_rows)) * 100;
        }
      } else if (workflow.stage === 'ENRICHING') {
        // Check enrichment progress
        const batchResult = await query(`
          SELECT 
            COUNT(*) as total_batches,
            SUM(CASE WHEN enrichment_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_batches,
            SUM(CASE WHEN enrichment_status = 'ERROR' THEN 1 ELSE 0 END) as error_batches
          FROM batch_processing_status
          WHERE file_id = $1
        `, [fileId]);
        
        if (batchResult.rows.length > 0) {
          const { total_batches, completed_batches } = batchResult.rows[0];
          if (parseInt(total_batches) > 0) {
            progress = (parseInt(completed_batches) / parseInt(total_batches)) * 100;
          }
        }
      } else if (workflow.stage === 'EXCLUSIONS') {
        // For now, exclusions is either 0% or 100%
        const exclusionsResult = await query(`
          SELECT COUNT(*) as count
          FROM savings_results
          WHERE file_id = $1 AND category = 'plans'
        `, [fileId]);
        
        progress = parseInt(exclusionsResult.rows[0].count) > 0 ? 100 : 50;
      } else if (workflow.stage === 'FORMULARY_EXCLUSIONS') {
        // Check formulary exclusions progress
        const formularyResult = await query(`
          SELECT COUNT(*) as count
          FROM savings_results
          WHERE file_id = $1 AND category = 'formulary'
        `, [fileId]);
        
        progress = parseInt(formularyResult.rows[0].count) > 0 ? 100 : 50;
      } else if (workflow.stage === 'COMPLETED') {
        progress = 100;
      }

      // Always invoke the orchestrator to check/progress the workflow, except for COMPLETED or ERROR without retry
      if ((workflow.stage !== 'COMPLETED' && workflow.stage !== 'ERROR') || retry) {
        // Invoke the orchestrator Lambda to check/progress the workflow
        try {
          console.log(`Invoking workflow-orchestrator Lambda for status check on workflow ${workflowId}`);
          
          await invokeLambda(
            process.env.WORKFLOW_ORCHESTRATOR_LAMBDA_NAME || 'workflow-orchestrator',
            {
              fileId,
              opportunityId,
              workflowId,
              action: 'status',
              retry: retry ? true : false
            },
            'RequestResponse' // Use synchronous invocation for immediate status update
          );
          
          console.log(`Successfully invoked workflow-orchestrator for status check`);
          
          // After direct invocation, refresh workflow status from the database
          const refreshResult = await query(`
            SELECT 
              workflow_id, 
              file_id, 
              opportunity_id, 
              stage, 
              started_at,
              completed_at,
              details
            FROM workflow_tracking
            WHERE workflow_id = $1
          `, [workflowId]);
          
          if (refreshResult.rows.length > 0) {
            workflow.stage = refreshResult.rows[0].stage;
            workflow.details = refreshResult.rows[0].details;
            workflow.completed_at = refreshResult.rows[0].completed_at;
          }
        } catch (invokeError) {
          console.error(`Error invoking workflow-orchestrator: ${invokeError}`);
          // Continue with current status even if invoke fails
        }
      }

      // Return the current status
      return NextResponse.json({
        workflowId: workflow.workflow_id,
        fileId: workflow.file_id,
        opportunityId: workflow.opportunity_id,
        stage: workflow.stage,
        progress,
        details: workflow.details,
        startedAt: workflow.started_at,
        completedAt: workflow.completed_at
      });
    }
    // Unknown action
    else {
      return NextResponse.json(
        { error: 'Invalid action. Supported actions: start, status' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in workflow API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process workflow request',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}