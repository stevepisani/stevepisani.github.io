// A temporary check of image delivery, one of SJPJr's areas (server.js has the protocol): test_image
// returns a tiny PNG made here (32×32, red on the left, blue on the right) as standard MCP image
// content, touching nothing else (no database, storage or photos). If ChatGPT can see it, images
// reach its model; if it can't see this but the wardrobe's photos fail too, the fault is on its
// side, not in how get_photo builds its answer (docs/apps.md, "Seeing a photo"). Remove once settled.
import { read } from "../kit.js";

export const TEST_PNG = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALklEQVR4nO3NQQkAAAgEMJNcEvunMIwZfAqD/VeTnKTnpAQCgUAgEAgEAsGXYAHPA5w9DhJY2AAAAABJRU5ErkJggg==";

export default {
  name: "image test",
  records: false,
  tools: [{
    name: "test_image",
    title: "Test image delivery",
    description: "A check that images reach you: returns a tiny PNG (32×32 pixels, its left half red, its right half blue) as an MCP image. Say what you see in it, and whether you received an image at all.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: read,
  }],
  status: { test_image: ["Sending the test image…", "Sent the test image"] },
  instructions: "",
  call: async () => ({
    text: "Test image attached: 32×32 PNG, left half red, right half blue.",
    images: [{ data: TEST_PNG, mimeType: "image/png" }],
    data: { test: "image", mime_type: "image/png", bytes: 103, width: 32, height: 32 },
  }),
};
