import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";

import { Construct } from "constructs";
import env from "./env";
import { envSchema as botEnvSchema } from "joinme-bot/src/lib/env";
import { z } from "zod";
import { rootDirectory } from "./util";

export class JoinmeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "table", {
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const bucket = new s3.Bucket(this, "bucket", {
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: false,
        ignorePublicAcls: true,
        restrictPublicBuckets: false,
      },
    });

    const defaultVpc = ec2.Vpc.fromLookup(this, "vpc", {
      isDefault: true,
    });

    const cluster = new ecs.Cluster(this, "cluster", {
      vpc: defaultVpc,
    });
    cluster.addCapacity("cluster-capacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.SMALL
      ),
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM),
    });

    const taskDefinition = new ecs.TaskDefinition(this, "task-def", {
      compatibility: ecs.Compatibility.EC2,
    });
    table.grantReadWriteData(taskDefinition.taskRole);
    bucket.grantReadWrite(taskDefinition.taskRole);

    taskDefinition.addContainer("container", {
      image: ecs.ContainerImage.fromAsset(rootDirectory, {
        exclude: ["cdk", "**/node_modules", ".git", ".gitignore"],
      }),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "joinme-bot" }),
      environment: {
        DISCORD_TOKEN: env.DISCORD_TOKEN,
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
        NODE_ENV: "production",
        AWS_REGION: this.region,
      } satisfies z.infer<typeof botEnvSchema>,
      memoryReservationMiB: 512,
      cpu: 256,
    });

    new ecs.Ec2Service(this, "service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
    });
  }
}
