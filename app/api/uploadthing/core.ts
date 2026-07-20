import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const ourFileRouter = {
  submissionFile: f({ blob: { maxFileSize: "32MB", maxFileCount: 1 } })
    .onUploadComplete(({ file }) => {
      return { url: file.ufsUrl, name: file.name };
    }),
  // UploadThing's FileSize type only accepts powers of two; 8MB is the smallest ceiling above the
  // 5MB limit the client already enforces before a file is ever handed to startUpload.
  feedbackImage: f({ image: { maxFileSize: "8MB", maxFileCount: 3 } })
    .onUploadComplete(({ file }) => {
      return { url: file.ufsUrl, key: file.key, name: file.name, size: file.size };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
