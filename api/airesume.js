export default async function handler(req, res) {
  const debug = [];

  const log = (label, data) => {
    debug.push(`${label}: ${typeof data === "object" ? JSON.stringify(data) : String(data)}`);
  };

  // Basic route and auth checks
  if (req.method !== "POST") {
    log("Invalid method", req.method);
    return res.status(404).json({ error: "Not found", debug });
  }

  const authHeader = req.headers["auth"];
  log("Auth Header", authHeader);
  if (authHeader !== "admin mouad@recruitcrm.io") {
    log("Unauthorized request");
    return res.status(401).json({ error: "Unauthorized", debug });
  }

  const contentType = req.headers["content-type"] || "";
  log("Content-Type", contentType);

  // Try to read raw body manually
  let rawBody = "";
  try {
    for await (const chunk of req) {
      rawBody += chunk;
    }
    log("Raw Body Received", rawBody);
  } catch (err) {
    log("Error reading body", err.message);
    return res.status(400).json({ error: "Error reading request body", debug });
  }

  let clientPayload;
  try {
    if (contentType.includes("application/json")) {
      clientPayload = JSON.parse(rawBody);
      log("Parsed JSON body", clientPayload);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      clientPayload = Object.fromEntries(new URLSearchParams(rawBody));
      log("Parsed form-urlencoded body", clientPayload);
    } else {
      log("Unhandled content-type, passing raw string as fallback");
      clientPayload = { raw: rawBody };
    }
  } catch (err) {
    log("JSON/Form parsing error", err.message);
    return res.status(400).json({ error: "Invalid JSON or form payload", debug });
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
    log("Missing pdfurl in payload");
    return res.status(400).json({ error: "Missing pdfurl in payload", debug });
  }

  try {
    const pdfResp = await fetch(pdfurl, { method: "GET", redirect: "manual" });
    log("PDF fetch status", pdfResp.status);

    if (pdfResp.status !== 302) {
      return res.status(400).json({
        error: `Expected 302 redirect from pdfurl but got ${pdfResp.status}`,
        debug,
      });
    }

    const pdfRedirectUrl = pdfResp.headers.get("Location");
    log("PDF Redirect URL", pdfRedirectUrl);

    if (!pdfRedirectUrl) {
      return res.status(400).json({ error: "No Location header on redirect", debug });
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

    log("Payload to /analyze", payload);

    const analyzeResp = await fetch("http://13.60.10.50/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Auth": "admin mouad@recruitcrm.io",
      },
      body: JSON.stringify(payload),
    });

    const analyzeText = await analyzeResp.text();
    log("Analyze API raw response", analyzeText);

    let parsedAnalyze;
    try {
      parsedAnalyze = JSON.parse(analyzeText);
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from analyze endpoint",
        raw: analyzeText,
        debug,
      });
    }

    return res.status(analyzeResp.status).json({ ...parsedAnalyze, debug });

  } catch (err) {
    log("Unhandled error", err.message);
    return res.status(500).json({
      error: "Internal server error",
      message: err.message,
      debug,
    });
  }
}
