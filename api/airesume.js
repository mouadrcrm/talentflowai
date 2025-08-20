export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(404).json({ error: "Not found" });
  }

  const authHeader = req.headers["auth"];
  if (authHeader !== "admin mouad@recruitcrm.io") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let clientPayload;
  try {
    let rawBody = "";

    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        rawBody += chunk;
      });
      req.on("end", resolve);
      req.on("error", reject);
    });

    // Normalize Ruby-style => to JSON-style :
    const normalized = rawBody
      .replace(/"=>/g, '":')
      .replace(/(\w+)=>/g, '"$1":');

    clientPayload = JSON.parse(normalized);
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON or form payload" });
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

    let parsedAnalyze;
    try {
      parsedAnalyze = JSON.parse(analyzeText);
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from analyze endpoint",
        raw: analyzeText,
      });
    }

    if (parsedAnalyze.hasOwnProperty("representation") && parsedAnalyze.representation === null) {
      delete parsedAnalyze.representation;
    }


    const casablancaOffsetMs = 60 * 60 * 1000; // +1h in ms
    const now = new Date(Date.now() + casablancaOffsetMs);
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Format as ISO string with microseconds
    const pad = (n) => String(n).padStart(2, '0');
    const isoWithMicroseconds = 
      `${future.getUTCFullYear()}-${pad(future.getUTCMonth() + 1)}-${pad(future.getUTCDate())}T` +
      `${pad(future.getUTCHours())}:${pad(future.getUTCMinutes())}:${pad(future.getUTCSeconds())}.000000Z`;


    const manipulated = { ...parsedAnalyze };
    manipulated.candidate_rating = 6;
    manipulated.Severity = "Medium";


    manipulated.expires_at = isoWithMicroseconds;
    return res
      .status(analyzeResp.status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .json(manipulated);

  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
}
