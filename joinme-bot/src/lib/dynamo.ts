import env from "./env";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchPutRequest, InputItem, list, map } from "dynamodb-toolbox";
import { ValidItem } from "dynamodb-toolbox";
import { DeleteItemCommand } from "dynamodb-toolbox";
import { GetItemCommand } from "dynamodb-toolbox";
import { DeletePartitionCommand } from "dynamodb-toolbox";
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
    uuid: string(),
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
  computeKey: ({ userId, activityName, guildId }) => ({
    pk: `USER#${userId}`,
    sk: `${activityMessageName}#${guildId}#${activityName}`,
  }),
});

export type GetActivityMessageParams = ValidItem<typeof activityMessageEntity, { mode: "key" }>;

export const getActivityMessage = async ({ userId, guildId, activityName }: GetActivityMessageParams) => {
  const { Item } = await activityMessageEntity
    .build(GetItemCommand)
    .key({
      userId,
      guildId,
      activityName,
    })
    .send();

  return Item;
};

export type DeleteActivityMessageParams = ValidItem<typeof activityMessageEntity, { mode: "key" }>;

export const deleteActivityMessage = async ({ userId, guildId, activityName }: DeleteActivityMessageParams) => {
  await activityMessageEntity
    .build(DeleteItemCommand)
    .key({
      userId,
      guildId,
      activityName,
    })
    .send();
};

export type QueryActivityMessagesParams = {
  userId: string;
  guildId: string;
};

export const queryActivityMessages = async ({ userId, guildId }: QueryActivityMessagesParams) => {
  const beginsWith = `${activityMessageName}#${guildId}`;

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

export type DeleteActivityMessagesParams = {
  userId: string;
  guildId: string;
  activityName?: string;
};

export const deleteActivityMessages = async ({ userId, guildId, activityName }: DeleteActivityMessagesParams) => {
  let beginsWith = `${activityMessageName}#${guildId}`;
  if (activityName) {
    beginsWith += `#${activityName}`;
  }

  await table
    .build(DeletePartitionCommand)
    .entities(activityMessageEntity)
    .query({
      partition: `USER#${userId}`,
      range: {
        beginsWith,
      },
    })
    .send();
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
