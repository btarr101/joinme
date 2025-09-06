import env from "./env";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchPutRequest, InputItem, list, map } from "dynamodb-toolbox";
import { QueryCommand, string } from "dynamodb-toolbox";
import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { Table } from "dynamodb-toolbox/table";
import { BatchWriteCommand, execute } from "dynamodb-toolbox/table/actions/batchWrite";

const dynamoDBClient = new DynamoDBClient();
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

export const table = new Table({
  name: env.TABLE_NAME,
  partitionKey: { name: "pk", type: "string" },
  sortKey: { name: "sk", type: "string" },
  documentClient,
});

const activityMessageName = "ACTIVITY_MESSAGE";

export const activityMessageEntity = new Entity({
  name: activityMessageName,
  table,
  schema: item({
    uuid: string().key(),
    userId: string().key(),
    guildId: string().key(),
    channelId: string(),
    activityName: string().key(),
    content: string(),
    attachments: list(
      map({
        name: string(),
        url: string(),
      }),
    ).default([]),
  }),
  computeKey: ({ userId, activityName, guildId, uuid }) => ({
    pk: `USER#${userId}`,
    sk: `${activityMessageName}#${guildId}#${activityName}#${uuid}`,
  }),
});

export type QueryActivityMessagesParams = {
  userId: string;
  guildId: string;
  activityName?: string;
};

export const queryActivityMessages = async ({ userId, activityName, guildId }: QueryActivityMessagesParams) => {
  let beginsWith = `${activityMessageName}#${guildId}`;
  if (activityName) beginsWith += `#${activityName}`;

  const query = await table
    .build(QueryCommand)
    .entities(activityMessageEntity)
    .query({
      partition: `USER#${userId}`,
      range: {
        beginsWith,
      },
    })
    .send();

  return query.Items ?? [];
};

const recordedActivityName = "RECORDED_ACTIVITY";

export const recordedActivityEntity = new Entity({
  name: recordedActivityName,
  table,
  schema: item({
    userId: string().key(),
    activityName: string().key(),
  }),
  computeKey: ({ userId, activityName }) => ({
    pk: `USER#${userId}`,
    sk: `${recordedActivityName}#${activityName}`,
  }),
});

export type QueryRecordedActivitesParams = {
  userId: string;
};

export const queryRecordedActivities = async ({ userId }: QueryRecordedActivitesParams) => {
  const activityOptionsQuery = await table
    .build(QueryCommand)
    .entities(recordedActivityEntity)
    .query({
      partition: `USER#${userId}`,
      range: {
        beginsWith: recordedActivityName,
      },
    })
    .send();

  return activityOptionsQuery.Items ?? [];
};

export const writeRecordedActivites = async (items: InputItem<typeof recordedActivityEntity>[]) => {
  await execute(
    table
      .build(BatchWriteCommand)
      .requests(...items.map((item) => recordedActivityEntity.build(BatchPutRequest).item(item))),
  );
};
