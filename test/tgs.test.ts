import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeTgs } from "../lib/tgs";

describe("Telegram animated sticker decoding", () => {
  it("decodes gzip-compressed TGS JSON and removes external image assets", async () => {
    const payload = {
      v: "5.7.4",
      w: 512,
      h: 512,
      layers: [{ ty: 4, nm: "wave" }],
      assets: [
        { id: "precomp", layers: [{ ty: 4 }] },
        { id: "external", p: "https://example.test/image.png", u: "" },
      ],
    };

    const decoded = await decodeTgs(gzipSync(strToU8(JSON.stringify(payload))));
    expect(decoded).toMatchObject({ w: 512, h: 512, layers: [{ nm: "wave" }] });
    expect(decoded.assets).toEqual([{ id: "precomp", layers: [{ ty: 4 }] }]);
  });

  it("rejects JSON that is not a Lottie animation", async () => {
    await expect(decodeTgs(strToU8(JSON.stringify({ hello: "world" })))).rejects.toThrow(
      "Invalid TGS animation"
    );
  });
});
