import cdk = require("@aws-cdk/core");
import {
  CfnGraphQLApi,
  CfnApiKey,
  CfnGraphQLSchema,
  CfnDataSource,
  CfnResolver
} from "@aws-cdk/aws-appsync";
import { CfnTable, AttributeType, BillingMode } from "@aws-cdk/aws-dynamodb";
import { Role, ServicePrincipal, ManagedPolicy } from "@aws-cdk/aws-iam";

export class AppsyncDynamodbStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const todosTable = new CfnTable(this, "TodosTable", {
      tableName: "Todos",
      keySchema: [
        {
          attributeName: "id",
          keyType: "HASH"
        }
      ],
      attributeDefinitions: [
        {
          attributeName: "id",
          attributeType: AttributeType.STRING
        }
      ],
      billingMode: BillingMode.PAY_PER_REQUEST
    });
    todosTable.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const todosTableRole = new Role(this, "TodosDynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com")
    });

    todosTableRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );

    const todosGraphqlApi = new CfnGraphQLApi(this, "TodosApi", {
      name: "todos-api",
      authenticationType: "API_KEY"
    });

    new CfnApiKey(this, "TodosApiKey", { apiId: todosGraphqlApi.attrApiId });

    const typeDefs = `
      type Todo {
        id: ID!
        name: String!
        description: String
      }
      input CreateTodoInput {
        id: ID
        name: String!
        description: String
      }
      input DeleteTodoInput {
        id: ID
      }
      type PaginatedTodos {
        todos: [Todo]
        nextToken: String
      }
      type Mutation {
        createTodo(input: CreateTodoInput!): Todo
        deleteTodo(input: DeleteTodoInput!): Todo
      }
      type Query {
        getTodo(id: ID!): Todo
        listTodos(limit: Int, nextToken: String): PaginatedTodos
      }
    `;

    const apiSchema = new CfnGraphQLSchema(this, "TodosSchema", {
      apiId: todosGraphqlApi.attrApiId,
      definition: typeDefs
    });
    apiSchema.addDependsOn(todosTable);

    const todosApiDataSource = new CfnDataSource(this, "TodosApiDataSource", {
      apiId: todosGraphqlApi.attrApiId,
      name: "TodosDynamoDBDataSource",
      type: "AMAZON_DYNAMODB",
      dynamoDbConfig: {
        tableName: "Todos",
        awsRegion: this.region
      },
      serviceRoleArn: todosTableRole.roleArn
    });

    const getTodoResolver = new CfnResolver(this, "GetTodoQueryResolver", {
      apiId: todosGraphqlApi.attrApiId,
      dataSourceName: todosApiDataSource.name,
      typeName: "Query",
      fieldName: "getTodo",
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "GetItem",
        "key": {
          "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`
    });
    getTodoResolver.addDependsOn(apiSchema);

    const listTodosResolver = new CfnResolver(this, "ListTodosQueryResolver", {
      apiId: todosGraphqlApi.attrApiId,
      typeName: "Query",
      fieldName: "listTodos",
      dataSourceName: todosApiDataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "Scan",
        "limit": $util.defaultIfNull($ctx.args.limit, 20),
        "nextToken": $util.toJson($util.defaultIfNullOrEmpty($ctx.args.nextToken, null))
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`
    });
    listTodosResolver.addDependsOn(apiSchema);

    const createTodoResolver = new CfnResolver(
      this,
      "CreateTodoMutationResolver",
      {
        apiId: todosGraphqlApi.attrApiId,
        typeName: "Mutation",
        dataSourceName: todosApiDataSource.name,
        fieldName: "createTodo",
        requestMappingTemplate: `{
          "version": "2017-02-28",
          "operation": "PutItem",
          "key": {
            "id": $util.dynamodb.toDynamoDBJson($util.defaultIfNullOrBlank($ctx.args.input.id, $util.autoId()))
          },
          "attributeValues": $util.dynamodb.toMapValuesJson($context.args.input)
        }`,
        responseMappingTemplate: `$util.toJson($ctx.result)`
      }
    );
    createTodoResolver.addDependsOn(apiSchema);

    const deleteTodoResolver = new CfnResolver(
      this,
      "DeleteTodoMutationResolver",
      {
        apiId: todosGraphqlApi.attrApiId,
        typeName: "Mutation",
        dataSourceName: todosApiDataSource.name,
        fieldName: "deleteTodo",
        requestMappingTemplate: `{
          "version": "2017-02-28",
          "operation": "DeleteItem",
          "key": {
            "id": $util.dynamodb.toDynamoDBJson($ctx.args.input.id)
          }
        }`,
        responseMappingTemplate: `$util.toJson($ctx.result)`
      }
    );
    deleteTodoResolver.addDependsOn(apiSchema);
  }
}
