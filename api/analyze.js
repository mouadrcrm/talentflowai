export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const backendUrl = 'http://13.60.10.50/analyze';

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Auth': req.headers['auth'] || '', // forward Auth header if present
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return res.status(response.status).json({
      statusCode: response.status,
      body,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Proxy error', details: error.message });
  }
}
