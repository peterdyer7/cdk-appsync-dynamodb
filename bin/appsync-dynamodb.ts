#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { AppsyncDynamodbStack } from '../lib/appsync-dynamodb-stack';

const app = new cdk.App();
new AppsyncDynamodbStack(app, 'AppsyncDynamodbStack');
