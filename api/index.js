const ASSET_VERSION = "redesign-1";

export default function handler(_request, response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#1e1712">
  <meta name="description" content="Quota Vita Nutrition Coach: a daily meal plan built around your body, goal and today's training.">
  <title>Quota Vita Nutrition Coach</title>
  <style>
    /* Critical shell only. The design system lives in /coach.css */
    html{-webkit-text-size-adjust:100%}
    body{margin:0;min-height:100dvh;background:#2a211b;color:#f7efe3;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .app{display:flex;flex-direction:column;min-height:100dvh}
    .main{flex:1;padding:24px 16px 96px}
  </style>
  <link rel="stylesheet" href="/coach.css?v=${ASSET_VERSION}">
</head>
<body>
  <div class="app">
    <header class="topbar" id="topbar"></header>
    <main class="main" id="coach"></main>
    <nav class="tabbar" id="tabbar" aria-label="Sections" hidden></nav>
  </div>
  <script src="/coach.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`);
}
