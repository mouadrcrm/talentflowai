export default async function handler(req, res) {
  const start = Date.now();

  if (req.method !== "POST") {
    return res.status(404).json({ error: "Not found" });
  }

  const authHeader = req.headers["auth"];
  if (authHeader !== "admin mouad@recruitcrm.io") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let clientPayload;
  try {
    clientPayload = req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const {
    pdfurl,
    jobname = "",
    jobdescription = "",
    min_experience = 0,
    max_experience = 0,
    min_salary = 0,
    max_salary = 0,
  } = clientPayload;

  if (!pdfurl) {
    return res.status(400).json({ error: "Missing pdfurl in payload" });
  }

  try {
    // Resolve PDF redirect
    const pdfResp = await fetch(pdfurl, { method: "GET", redirect: "manual" });
    if (pdfResp.status !== 302) {
      return res.status(400).json({
        error: `Expected 302 redirect from pdfurl but got status ${pdfResp.status}`,
      });
    }

    const pdfRedirectUrl = pdfResp.headers.get("Location");
    if (!pdfRedirectUrl) {
      return res.status(400).json({ error: "No Location header on pdf redirect" });
    }

    // Clean up JD
    const cleanedJD = String(jobdescription)
      .replace(/<script\b[^<]*<\/script>/gi, "")
      .replace(/<style\b[^<]*<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const payload = {
      pdfUrl: pdfRedirectUrl,
      jobDetails: {
        name: jobname,
        jd: cleanedJD,
        min_experience: Number(min_experience),
        max_experience: Number(max_experience),
        salary_range: {
          min: Number(min_salary),
          max: Number(max_salary),
        },
      },
    };

    const analyzeResp = await fetch("http://13.60.10.50/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Auth": "admin mouad@recruitcrm.io",
      },
      body: JSON.stringify(payload),
    });

    const analyzeText = await analyzeResp.text();
    const duration = Date.now() - start;

    return res.status(analyzeResp.status).json({
      message: "Request completed",
      analyzeResponse: analyzeText,
      debug: {
        pdfRedirectUrl,
        analyzePayload: payload,
        requestDurationMs: duration,
        rawJobDescription: jobdescription,
        processedJobDescription: cleanedJD,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
}
