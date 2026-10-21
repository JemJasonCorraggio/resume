import { auditInventory } from "./validation.js";

const inventoryAssetUrl = "https://inventory/master-career-inventory.json";
const loadFailure = {
  loaded: false,
  error: "The inventory could not be loaded. Check the API server logs.",
};

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/inventory") {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  let inventory;
  try {
    const asset = await env.INVENTORY_ASSETS.fetch(inventoryAssetUrl);
    if (!asset.ok) throw new Error(`Inventory asset request returned HTTP ${asset.status}`);
    inventory = await asset.json();
  } catch (error) {
    console.error("Could not load bundled career inventory:", error);
    return jsonResponse(loadFailure, 500);
  }

  return jsonResponse({
    loaded: true,
    inventory,
    validation: auditInventory(inventory),
  });
}

export default {
  fetch: handleRequest,
};
