import env from "./env";
import { PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const s3Client = new S3Client();

export type UploadAttachmentParams = {
  messageUUID: string;
  name: string;
  body: PutObjectCommandInput["Body"];
};

export const uploadAttachment = async ({ messageUUID, name, body }: UploadAttachmentParams) => {
  const key = `${messageUUID}-${name}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.BUCKET_NAME,
      Key: key,
      Body: body,
    },
  });

  await upload.done();

  return `https://${env.BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};
