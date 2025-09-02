#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { JoinmeStack as JoinmeStack } from "../lib/cdk-stack";

const app = new cdk.App();
new JoinmeStack(app, "JoinmeStack");
