import { describe, expect, it } from "vitest";
import {
  albumMediaKind,
  attachmentKindForFiles,
  mediaGroupError,
  paidMediaError,
  profilePhotoKind,
  singleAttachmentKind,
  type MediaFileLike,
} from "../lib/media";

const file = (name: string, type: string): MediaFileLike => ({ name, type });

describe("composer media selection", () => {
  it("opens the correct sender for pasted or selected single files", () => {
    expect(singleAttachmentKind(file("shot.png", "image/png"))).toBe("photo");
    expect(singleAttachmentKind(file("reaction.gif", "image/gif"))).toBe("animation");
    expect(singleAttachmentKind(file("clip.mp4", "video/mp4"))).toBe("video");
    expect(singleAttachmentKind(file("song.mp3", "audio/mpeg"))).toBe("audio");
    expect(singleAttachmentKind(file("notes.pdf", "application/pdf"))).toBe("document");
    expect(attachmentKindForFiles([file("a.png", "image/png"), file("b.mp4", "video/mp4")])).toBe("media_group");
  });

  it("models Telegram album grouping rules per file", () => {
    const photoVideo = [file("a.jpg", "image/jpeg"), file("b.mp4", "video/mp4")];
    expect(photoVideo.map(albumMediaKind)).toEqual(["photo", "video"]);
    expect(mediaGroupError(photoVideo)).toBeNull();
    expect(mediaGroupError([file("a.mp3", "audio/mpeg"), file("b.ogg", "audio/ogg")])).toBeNull();
    expect(mediaGroupError([file("a.pdf", "application/pdf"), file("b.zip", "application/zip")])).toBeNull();
    expect(mediaGroupError([file("a.jpg", "image/jpeg")])).toContain("at least 2");
    expect(mediaGroupError([file("a.jpg", "image/jpeg"), file("b.pdf", "application/pdf")])).toContain("documents only");
    expect(mediaGroupError(Array.from({ length: 11 }, (_, index) => file(`${index}.jpg`, "image/jpeg")))).toContain("at most 10");
  });

  it("limits paid media and recognizes static or animated bot avatars", () => {
    expect(paidMediaError([file("a.jpg", "image/jpeg"), file("b.mp4", "video/mp4")])).toBeNull();
    expect(paidMediaError([file("a.gif", "image/gif")])).toContain("photos and videos only");
    expect(profilePhotoKind(file("avatar.png", "image/png"))).toBe("static");
    expect(profilePhotoKind(file("avatar.JPG", ""))).toBe("static");
    expect(profilePhotoKind(file("avatar.mp4", "video/mp4"))).toBe("animated");
    expect(profilePhotoKind(file("avatar.webm", "video/webm"))).toBeNull();
  });
});
