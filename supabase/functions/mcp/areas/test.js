// Checks of image delivery (test_images: several at once, numbered), one of SJPJr's areas (server.js has the protocol): test_image
// returns a tiny PNG made here (32×32, red on the left, blue on the right) as standard MCP image
// content, touching nothing else (no database, storage or photos). If ChatGPT can see it, images
// reach its model; if it can't see this but the wardrobe's photos fail too, the fault is on its
// side, not in how get_photo builds its answer (docs/apps.md, "Seeing a photo"). Remove once settled.
import { read, Invalid } from "../kit.js";
import { TEST_PICTURES, testPicture, base64 } from "../images.js";

export const TEST_PNG = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALklEQVR4nO3NQQkAAAgEMJNcEvunMIwZfAqD/VeTnKTnpAQCgUAgEAgEAsGXYAHPA5w9DhJY2AAAAABJRU5ErkJggg==";

export default {
  name: "image test",
  records: false,
  tools: [
    {
      name: "test_image",
      title: "Test image delivery",
      description: "A check that images reach you: returns a tiny PNG (32×32 pixels, its left half red, its right half blue) as an MCP image. Say what you see in it, and whether you received an image at all.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: read,
    },
    {
      name: "test_images",
      title: "Test several images at once",
      description: `A check that several images reach you in one answer: returns count of them (1 to ${TEST_PICTURES.length}), each plain and different, in a fixed order. Say how many you received, what each shows and in what order; the answer's text doesn't say, so it can't be read instead. size small: 64 px; vision: 768 px, about the size of the wardrobe's vision copies. PNGs, made here.`,
      inputSchema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: TEST_PICTURES.length }, size: { type: "string", enum: ["small", "vision"] } }, additionalProperties: false },
      annotations: read,
    },
  ],
  status: { test_image: ["Sending the test image…", "Sent the test image"], test_images: ["Sending the test images…", "Sent the test images"] },
  instructions: "",
  call: async (name, args, ctx) => {
    if (name === "test_image") return {
      text: "Test image attached: 32×32 PNG, left half red, right half blue.",
      images: [{ data: TEST_PNG, mimeType: "image/png" }],
      data: { test: "image", mime_type: "image/png", bytes: 103, width: 32, height: 32 },
    };
    const count = args.count ?? 4, vision = args.size === "vision";
    if (!(count >= 1 && count <= TEST_PICTURES.length)) throw new Invalid(`count is 1 to ${TEST_PICTURES.length}.`);
    const images = [];
    for (let i = 0; i < count; i++) images.push({ data: base64(await testPicture(i, vision ? 768 : 64)), mimeType: "image/png" });
    return {
      text: `${count} test image${count === 1 ? "" : "s"} attached, numbered 1 to ${count}. Say how many you received and what each one shows, in order.`,
      images,
      // what each shows, for checking an answer against (structured, so it isn't read as the answer)
      data: { test: "images", count, size: vision ? "vision" : "small", answer_key: TEST_PICTURES.slice(0, count).map(([what], i) => ({ image: i + 1, shows: what })) },
    };
  },
};
