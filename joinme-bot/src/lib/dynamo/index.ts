import env from "../env";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { number, string } from "dynamodb-toolbox";
import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { Table } from "dynamodb-toolbox/table";

const dynamoDBClient = new DynamoDBClient();
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

export const table = new Table({
  name: env.TABLE_NAME,
  partitionKey: { name: "pk", type: "string" },
  sortKey: { name: "sk", type: "string" },
  documentClient,
});

export const activityMessageEntity = new Entity({
  name: "ACTIVITY_MESSAGE",
  table,
  schema: item({
    uuid: string().key(),
    userId: string().key(),
    guildId: string().key(),
    channelId: string(),
    activityName: string().key(),
    content: string(),
  }),
  computeKey: ({ userId, activityName, guildId, uuid }) => ({
    pk: `USER#${userId}`,
    sk: `ACTIVITY_MESSAGE#${activityName}#${guildId}#${uuid}`,
  }),
});

export const recordedActivity = new Entity({
  name: "RECORDED_ACTIVITY",
  table,
  schema: item({
    userId: string().key(),
    activityName: string().key(),
  }),
  computeKey: ({ userId, activityName }) => ({
    pk: `USER#${userId}`,
    sk: `RECORDED_ACTIVITY#${activityName}`,
  }),
});
