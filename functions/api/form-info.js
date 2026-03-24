export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(context.request.url);
  const formUrl = url.searchParams.get('url');

  if (!formUrl || (!formUrl.includes('docs.google.com/forms') && !formUrl.includes('forms.gle'))) {
    return new Response(JSON.stringify({ error: 'Invalid Google Form URL' }), {
      status: 400, headers: corsHeaders
    });
  }

  try {
    // Fetch the Google Form HTML server-side with redirect support
    const res = await fetch(formUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow'
    });
    const html = await res.text();

    // Extract FB_PUBLIC_LOAD_DATA_ - Google's form data structure
    const dataMatch = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!dataMatch) {
      return new Response(JSON.stringify({ error: 'Cannot parse form data. Make sure the form is public.' }), {
        status: 422, headers: corsHeaders
      });
    }

    const rawData = JSON.parse(dataMatch[1]);
    const questions = rawData[1][1];
    const fields = [];

    for (const q of questions) {
      if (!q || !Array.isArray(q)) continue;
      const title = q[1] || '';
      const type = q[3]; 
      const entryData = q[4];
      if (!entryData || !entryData[0]) continue;

      const entryId = entryData[0][0];
      if (!entryId) continue;

      let options = [];
      if (entryData[0][1]) {
        options = entryData[0][1].map(o => o[0]).filter(Boolean);
      }

      fields.push({ title, entryId: `entry.${entryId}`, type, options });
    }

    // Extract reliable submit URL directly from the form action
    let submitUrl = null;
    const actionMatch = html.match(/<form[^>]+action=["']([^"']+formResponse)["']/);
    
    if (actionMatch) {
      submitUrl = actionMatch[1];
    } else {
      // Fallback
      const redirectedUrl = res.url;
      const formIdMatch = redirectedUrl.match(/\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([^/]+)/);
      const formId = formIdMatch ? formIdMatch[1] : null;
      submitUrl = formId ? `https://docs.google.com/forms/d/e/${formId}/formResponse` : null;
    }

    // Auto-map fields based on keywords
    const mapped = fields.map(f => {
      const t = f.title.toLowerCase();
      let autoMap = null;
      if (t.includes('email') || t.includes('อีเมล')) autoMap = 'email';
      else if (t.includes('first') || t.includes('ชื่อ-นามสกุล') || t.includes('ชื่อ') || (t.includes('name') && !t.includes('last'))) autoMap = 'firstName';
      else if (t.includes('last') || t.includes('นามสกุล')) autoMap = 'lastName';
      else if (t.includes('id') || t.includes('passport') || t.includes('identification') || t.includes('cccd') || t.includes('เลขบัตรประชาชน') || t.includes('เลขพาสปอร์ต') || t.includes('เลขบัตร')) autoMap = 'idNumber';
      else if (t.includes('phone') || t.includes('tel') || t.includes('mobile') || t.includes('โทร') || t.includes('เบอร์')) autoMap = 'phone';
      else if (t.includes('yes') || t.includes('review') || t.includes('confirm') || t.includes('ตรวจสอบ') || t.includes('ใช่') || t.includes('agree') || t.includes('ยอมรับ')) autoMap = 'confirm';
      return { ...f, autoMap };
    });

    return new Response(JSON.stringify({ fields: mapped, submitUrl }), {
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Server error: ${err.message}` }), {
      status: 500, headers: corsHeaders
    });
  }
}
