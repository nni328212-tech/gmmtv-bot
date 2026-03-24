export async function onRequestPost({ request }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data = await request.json();
    const { submitUrl, formData } = data;

    if (!submitUrl) {
      return new Response(JSON.stringify({ error: 'Missing submitUrl' }), { status: 400, headers: corsHeaders });
    }

    const body = new URLSearchParams();
    for (const [key, val] of Object.entries(formData)) {
      if (val) body.append(key, val);
    }

    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0'
      },
      body: body.toString()
    });

    const text = await res.text();
    
    // Google Forms usually re-renders the form on validation errors or missing fields
    // If it succeeds, it shows a confirmation page WITHOUT the full form payload.
    // So if FB_PUBLIC_LOAD_DATA_ is clearly present, it failed.
    const isError = text.includes('FB_PUBLIC_LOAD_DATA_');
    const isCaptcha = text.includes('captcha') || text.includes('g-recaptcha');

    if (res.status === 200 && !isError && !isCaptcha) {
      return new Response(JSON.stringify({ success: true, url: res.url }), { status: 200, headers: corsHeaders });
    } else {
      let errMsg = 'Failed mapping / validation (Google required more info).';
      if (isCaptcha) errMsg = 'Blocked by Google ReCAPTCHA. Form requires browser submission.';
      return new Response(JSON.stringify({ error: errMsg, url: res.url }), { status: 400, headers: corsHeaders });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: `Submit error: ${err.message}` }), { status: 500, headers: corsHeaders });
  }
}
