export interface Env {
  diagnose_server: KVNamespace;
}

interface Item {
  errors: any; 
  [key: string]: any;
}

function generateCustomKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const getRandomChar = () => chars.charAt(Math.floor(Math.random() * chars.length));

  let group1 = "";
  for (let i = 0; i < 3; i++) group1 += getRandomChar();

  let group2 = "";
  for (let i = 0; i < 3; i++) group2 += getRandomChar();

  return `P${group1}V${group2}Z`;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const method = request.method;

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };

    try {
      if (method === "OPTIONS") {
        return new Response(null, { headers });
      }

      if (method === "POST" && !key) {
        let encodedBody = "";
        try {
          encodedBody = await request.text();
        } catch (e) {
          return new Response(JSON.stringify({ error: "Read body failed" }), { status: 400, headers });
        }

        if (!encodedBody) {
            return new Response(JSON.stringify({ error: "Empty body" }), { status: 400, headers });
        }

        let decodedJsonString = "";
        let parsedData: any;

        try {
          decodedJsonString = decodeURIComponent(encodedBody);
          parsedData = JSON.parse(decodedJsonString);
        } catch (e) {
          return new Response(JSON.stringify({ 
            error: "Invalid URL Encoded JSON", 
            details: "Body must be a URL-encoded valid JSON string" 
          }), { status: 400, headers });
        }

        if (!parsedData || typeof parsedData !== 'object' || !("errors" in parsedData)) {
          return new Response(JSON.stringify({
            error: "Missing Required Field",
            details: "The JSON object must contain an 'errors' field."
          }), { status: 400, headers });
        }

        const newKey = generateCustomKey();

        await env.diagnose_server.put(newKey, decodedJsonString, {
          expirationTtl: 86400, // 1天
        });

        return new Response(
          JSON.stringify({ 
            message: "Created successfully", 
            key: newKey, 
            data: parsedData,
          }),
          { status: 201, headers }
        );
      }

      if (method === "GET" && key) {
        const value = await env.diagnose_server.get<Item>(key, "json");

        if (!value) {
          return new Response(JSON.stringify({ error: "Key not found or expired" }), {
            status: 404,
            headers,
          });
        }

        return new Response(JSON.stringify(value), { headers });
      }

      return new Response(JSON.stringify({ error: "Not Found or Method Not Allowed" }), {
        status: 404,
        headers,
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || "Server Error" }), {
        status: 500,
        headers,
      });
    }
  },
};