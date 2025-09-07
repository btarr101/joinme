#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { JoinmeStack as JoinmeStack } from "../lib/cdk-stack";
import env from "../lib/env";

const app = new cdk.App();
new JoinmeStack(app, `JoinmeStack-${env.ENVIRONMENT}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
