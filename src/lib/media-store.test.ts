import { beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.fn();
vi.mock("@vercel/blob", () => ({ put, del: vi.fn(), get: vi.fn() }));
const { isPrivateBlob, saveBlob } = await import("./media-store");

beforeEach(() => {
  put.mockReset();
});

describe("saveBlob", () => {
  it("saves in the post's folder, and uses a private store when public is refused", async () => {
    put
      .mockImplementationOnce(async () => {
        throw new Error("This store is private");
      })
      .mockResolvedValueOnce({
      url: "https://abc.private.blob.vercel-storage.com/posts/p1/My-slide.png",
    });
    const url = await saveBlob("p1", "My slide!.png", new Uint8Array([1]), "image/png");
    expect(url).toContain(".private.");
    expect(put.mock.calls[0][0]).toBe("posts/p1/My-slide-.png");
    expect(put.mock.calls.map((c) => c[2].access)).toEqual(["public", "private"]);

    // Remembered: the next file goes private first.
    put.mockClear();
    put.mockResolvedValueOnce({ url: "https://abc.private.blob.vercel-storage.com/posts/p1/b.png" });
    await saveBlob("p1", "b.png", new Uint8Array([1]), "image/png");
    expect(put.mock.calls[0][2].access).toBe("private");
  });

  it("says why when the store refuses both", async () => {
    put.mockImplementation(async () => {
      throw new Error("Store suspended");
    });
    await expect(saveBlob("p1", "a.pdf", new Uint8Array([1]), "application/pdf")).rejects.toThrow("File storage said no: Store suspended");
  });

  it("tells private files apart", () => {
    expect(isPrivateBlob("https://abc.private.blob.vercel-storage.com/posts/p1/a.png")).toBe(true);
    expect(isPrivateBlob("https://abc.public.blob.vercel-storage.com/posts/p1/a.png")).toBe(false);
    expect(isPrivateBlob("local:abc")).toBe(false);
  });
});
