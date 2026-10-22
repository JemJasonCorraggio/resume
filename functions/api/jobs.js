export async function onRequest({ request, env }) {
  return env.INVENTORY_API.fetch(request);
}
