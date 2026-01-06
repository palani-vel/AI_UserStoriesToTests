import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// GET /api/jira-details?jiraId={issueIdOrKey}
router.get('/', async (req: Request, res: Response) => {
  // Prevent caching for this endpoint
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const jiraId = req.query.jiraId as string;
  if (!jiraId) {
    res.status(400).json({ error: 'JIRA ID is required as a query parameter.' });
    return;
  }

  // Jira API credentials from environment variables
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

  if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_BASE_URL) {
    res.status(500).json({ error: 'JIRA credentials or base URL not set in environment variables.' });
    return;
  }

  const authString = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_BASE_URL}/rest/api/2/issue/${jiraId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {}
      res.status(response.status).json({ error: errorData.errorMessages?.[0] || 'Jira issue not found. Please check the JIRA ID.' });
      return;
    }

    let data: any = {};
    try {
      data = await response.json();
    } catch {}
    // Map Jira fields to frontend fields
    const fields = data.fields || {};
    res.json({
      storyTitle: fields.summary || '',
      description: fields.description || '',
      acceptanceCriteria: '', // You may need to parse from description or custom field
      additionalInfo: '' // You may need to parse from custom field
    });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch Jira details' });
    return;
  }
});

export default router;
