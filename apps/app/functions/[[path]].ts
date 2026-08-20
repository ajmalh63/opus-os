export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  
  // Forward API requests directly to the Cloudflare API Worker
  if (url.pathname.startsWith('/api/')) {
    const apiUrl = new URL(url.pathname + url.search, 'https://opusos-api.ajmalsn63.workers.dev');
    return fetch(new Request(apiUrl, context.request));
  }
  
  // Fetch the static asset from Cloudflare Edge
  const response = await context.env.ASSETS.fetch(context.request);
  
  // If route is not an asset file and returns 404, serve index.html for SPA client routing
  if (response.status === 404 && !url.pathname.includes('.')) {
    return context.env.ASSETS.fetch(new URL('/index.html', context.request.url));
  }
  
  return response;
};
