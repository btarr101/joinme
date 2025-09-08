import env from "./env";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchPutRequest, InputItem, list, map, number } from "dynamodb-toolbox";
import { ValidItem } from "dynamodb-toolbox";
import { DeleteItemCommand } from "dynamodb-toolbox";
import { PutItemCommand } from "dynamodb-toolbox";
import { Condition } from "dynamodb-toolbox";
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
    guildId: string().key(),
    userId: string().key(),
    channelId: string().key(),
    activityName: string().key(),
    content: string(),
    attachments: list(
      map({
        name: string(),
        url: string(),
      }),
    ).default([]),
  }),
  computeKey: ({ guildId, userId, activityName, channelId }) => ({
    pk: `GUILD#${guildId}`,
    sk: `${activityMessageName}#${userId}#${activityName}#${channelId}`,
  }),
});

export type GetActivityMessageParams = ValidItem<typeof activityMessageEntity, { mode: "key" }>;

export const getActivityMessage = async ({ guildId, userId, activityName, channelId }: GetActivityMessageParams) => {
  const { Item } = await activityMessageEntity
    .build(GetItemCommand)
    .key({
      userId,
      guildId,
      activityName,
      channelId,
    })
    .send();

  return Item;
};

export type DeleteActivityMessageParams = ValidItem<typeof activityMessageEntity, { mode: "key" }>;

export const deleteActivityMessage = async ({
  guildId,
  userId,
  activityName,
  channelId,
}: DeleteActivityMessageParams) => {
  await activityMessageEntity
    .build(DeleteItemCommand)
    .key({
      userId,
      guildId,
      activityName,
      channelId,
    })
    .send();
};

export type QueryActivityMessagesParams = {
  userId: string;
  guildId: string;
  channelId?: string;
  activityName?: string;
};

export const queryActivityMessages = async ({
  guildId,
  userId,
  channelId,
  activityName,
}: QueryActivityMessagesParams) => {
  let beginsWith = `${activityMessageName}#${userId}`;
  if (activityName) {
    beginsWith += `#${activityName}`;
  }

  let filter: Condition<typeof activityMessageEntity> | undefined;
  if (channelId) {
    if (activityName) {
      beginsWith += `#${channelId}`;
    } else {
      filter = {
        attr: "channelId",
        eq: channelId,
      };
    }
  }

  const query = await table
    .build(QueryCommand)
    .entities(activityMessageEntity)
    .query({
      partition: `GUILD#${guildId}`,
      range: {
        beginsWith,
      },
    })
    .options(
      filter
        ? {
            filters: {
              ACTIVITY_MESSAGE: filter,
            },
          }
        : {},
    )
    .send();

  return query.Items ?? [];
};

export type DeleteActivityMessagesParams = {
  userId: string;
  guildId: string;
  channelId?: string;
  activityName?: string;
};

export const deleteActivityMessages = async ({
  guildId,
  userId,
  channelId,
  activityName,
}: DeleteActivityMessagesParams) => {
  let beginsWith = `${activityMessageName}#${userId}`;
  if (activityName) {
    beginsWith += `#${activityName}`;
  }

  await table
    .build(DeletePartitionCommand)
    .entities(activityMessageEntity)
    .query({
      partition: `GUILD#${guildId}`,
      range: {
        beginsWith,
      },
    })
    .options(
      channelId
        ? {
            filters: {
              ACTIVITY_MESSAGE: {
                attr: "channelId",
                eq: channelId,
              },
            },
          }
        : {},
    )
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

const interactionTokenName = "INTERACTION_TOKEN";

export const interactionTokenEntity = new Entity({
  name: interactionTokenName,
  table,
  schema: item({
    uuid: string().key(),
    token: string(),
    expiresAt: number(),
  }),
  computeKey: ({ uuid }) => ({
    pk: `${interactionTokenName}#${uuid}`,
    sk: `${interactionTokenName}`,
  }),
});

export const writeInteractionToken = (item: InputItem<typeof interactionTokenEntity>) =>
  interactionTokenEntity.build(PutItemCommand).item(item).send();

export const getInteractionToken = async (uuid: string) =>
  (
    await interactionTokenEntity
      .build(GetItemCommand)
      .key({
        uuid,
      })
      .send()
  ).Item;
