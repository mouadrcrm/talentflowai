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

      // 🚨 Force rating to 4 wherever it exists
      if (parsedAnalyze && typeof parsedAnalyze === "object") {
        if ("rating" in parsedAnalyze) {
          parsedAnalyze.rating = 4;
        } else if (
          parsedAnalyze.jobInsights &&
          typeof parsedAnalyze.jobInsights === "object" &&
          "rating" in parsedAnalyze.jobInsights
        ) {
          parsedAnalyze.jobInsights.rating = 4;
        }
      }

    } catch {
      return res.status(502).json({
        error: "Invalid JSON from analyze endpoint",
        raw: analyzeText,
      });
    }

    return res
      .status(analyzeResp.status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .json(parsedAnalyze);

  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
}
