const https = require('https');

// Set FRED_API_KEY in Netlify env vars (Site settings → Environment variables).
const FRED_API_KEY = process.env.FRED_API_KEY;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from FRED')); }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600' // cache 1 hour
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { series_id, limit = '2' } = event.queryStringParameters || {};

  if (!series_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'series_id is required' })
    };
  }

  // Whitelist allowed series IDs for security
  const ALLOWED = [
    'MORTGAGE30US', 'DGS10', 'FEDFUNDS', 'CPIAUCSL',
    'DPRIME', 'HOUST', 'RRVRUSQ156N', 'MSPUS', 'CSUSHPISA'
  ];

  if (!ALLOWED.includes(series_id)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Series not permitted' })
    };
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series_id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const data = await httpsGet(url);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
