export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("Hello from HMADV API Worker!", {
      headers: { "content-type": "text/plain" },
    });
  },
};
