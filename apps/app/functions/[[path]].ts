export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith('/api/')) {
    const apiUrl = new URL(url.pathname + url.search, 'https://opusos-api.ajmalsn63.workers.dev');
    return fetch(new Request(apiUrl, context.request));
  }
  const response = await context.env.ASSETS.fetch(context.request);
  if (response.status === 404 && !url.pathname.includes('.')) {
    return context.env.ASSETS.fetch(new URL('/index.html', context.request.url));
  }
  return response;
};
