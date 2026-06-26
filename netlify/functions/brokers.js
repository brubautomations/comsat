// Reads every broker row from the data store and returns clean JSON.
// Credentials live in environment variables — never exposed to the browser.

const TABLE = "BrokerFinancials";

const FIELD_MAP = {
  "Broker Name": "name",
  "Broker Code": "code",
  "Year": "year",
  "Total Assets": "assets",
  "Total Liabilities": "liabilities",
  "Total Equity": "equity",
  "Cash": "cash",
  "Receivables": "receivables",
  "Total Revenue": "revenue",
  "Commission Income": "commission",
  "Trading Gains": "trading",
  "Operating Expenses": "opex",
  "Net Income": "netIncome",
  "Retained Earnings": "retained",
  "RBCA Ratio": "rbca",
};

exports.handler = async () => {
  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE = process.env.AIRTABLE_BASE_ID;

  if (!TOKEN || !BASE) {
    return json(500, { error: "Data feed not configured." });
  }

  try {
    let records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!resp.ok) {
        const t = await resp.text();
        return json(resp.status, { error: "Upstream error", detail: t.slice(0, 200) });
      }
      const data = await resp.json();
      records = records.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    const rows = records
      .map((rec) => {
        const f = rec.fields || {};
        const o = {};
        for (const [src, dst] of Object.entries(FIELD_MAP)) {
          let v = f[src];
          if (v === undefined) v = null;
          if (dst === "year" && v != null) v = parseInt(v, 10);
          if (dst === "code" && v != null) v = String(v);
          o[dst] = v;
        }
        return o;
      })
      .filter((o) => o.code && o.year);

    // --- Ads (optional table). Never let this break the broker feed. ---
    let ads = [];
    try {
      const adUrl = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent("Ads")}?pageSize=100`;
      const adResp = await fetch(adUrl, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (adResp.ok) {
        const adData = await adResp.json();
        ads = (adData.records || [])
          .map((rec) => {
            const f = rec.fields || {};
            return {
              slot: f["Slot"] || "",
              image: f["Image URL"] || "",
              link: f["Link URL"] || "",
              active: f["Active"],
            };
          })
          .filter((a) => a.image && a.active !== false);
      }
    } catch (e) {
      ads = [];
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
      },
      body: JSON.stringify({ rows, ads }),
    };
  } catch (e) {
    return json(500, { error: String(e) });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
