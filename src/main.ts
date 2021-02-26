/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ClientRequestContext, DbResult, Id64String } from "@bentley/bentleyjs-core";
import { IModelHost, DesktopAuthorizationClient, BriefcaseDb, BriefcaseManager, RequestNewBriefcaseArg, ProgressFunction, ECSqlStatement } from "@bentley/imodeljs-backend";
import { DesktopAuthorizationClientConfiguration, IModelVersion } from "@bentley/imodeljs-common";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { Presentation } from "@bentley/presentation-backend";
import { Ruleset, RuleTypes, ContentSpecificationTypes, DescriptorOverrides, DefaultContentDisplayTypes, PropertyValueFormat, ContentFlags, Field } from "@bentley/presentation-common";

async function signIn(): Promise<AccessToken|undefined> {

  const config: DesktopAuthorizationClientConfiguration = {
    clientId: "imodeljs-electron-samples",
    redirectUri: "http://localhost:3000/signin-callback",
    scope: "openid email profile organization imodelhub context-registry-service:read-only product-settings-service projectwise-share urlps-third-party offline_access"
  };

  const client = new DesktopAuthorizationClient(config);
  const requestContext = new ClientRequestContext();
  await client.initialize(requestContext);

  return new Promise<AccessToken | undefined>((resolve, _reject) => {
    client.onUserStateChanged.addListener((token: AccessToken | undefined) => resolve(token));
    client.signIn(requestContext);
  });
}

export async function main(process: NodeJS.Process): Promise<void> {
  try {
    await IModelHost.startup();

    const accessToken: AccessToken | undefined = await signIn();
    if (!accessToken) {
      console.error("Failed to sign-in");
      return;
    }

    const urlString = "https://connect-imodelweb.bentley.com/imodeljs/?projectId=<project>&iModelId=<iModel>>&ChangeSetId=<ChangeSet>";
    const url = new URL(urlString.toLowerCase());
    const projectId: string = url.searchParams.get("projectid") ?? '';
    const iModelId: string = url.searchParams.get("imodelid") ?? '';
    const changeSetId: string = url.searchParams.get("changesetid") ?? '';
    const version = changeSetId === undefined ? IModelVersion.latest() : IModelVersion.asOfChangeSet(changeSetId);

    // If this function returns non-zero, the download is aborted.
    const progressTracking: ProgressFunction = (loaded: number, total: number):  number => {
      const percent = loaded/total*100;
      process.stdout.cursorTo(0);
      process.stdout.write(`Downloaded: ${percent.toFixed(2)} %`);

      return 0;
    }

    console.log(`Started opening iModel (projectId=${projectId}, iModelId=${iModelId}, changeSetId=${changeSetId})`);
    const requestContext: AuthorizedClientRequestContext = new AuthorizedClientRequestContext(accessToken);
    const requestNewBriefcaseArg: RequestNewBriefcaseArg = { contextId: projectId, iModelId: iModelId, asOf: version.toJSON(), briefcaseId: 0, onProgress: progressTracking };
    const briefcaseProps = await BriefcaseManager.downloadBriefcase(requestContext, requestNewBriefcaseArg);
    requestContext.enter();

    const iModelDb = await BriefcaseDb.open(requestContext, briefcaseProps);
    requestContext.enter()
    console.log("\nFinished opening iModel");

    // You must call this before calling any presentation methods.
    Presentation.initialize();

    // Create a simple rule set (https://www.itwinjs.org/reference/presentation-common/presentationrules/)
    // We will have more content coming on making rule sets
    const RULESET: Ruleset = {
      id: `properties`,
      rules: [{
        ruleType: RuleTypes.Content,
        specifications: [{ specType: ContentSpecificationTypes.SelectedNodeInstances }]
      }],
    };

    // We need the element ids for the elements we wan to get presentation results for.
    const ecSql = "SELECT ECInstanceId FROM BisCore.PhysicalElement LIMIT 10";
    const ids: Id64String[] = [];
    await iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        ids.push(statement.getValue(0).getId());
      }
    });


    // This method gets the keys used when getting the content for the selected elements
    // In this case I chose to include all ids in one call, but it is also ok to make one set of calls for each element.
    const keys = await Presentation.getManager().computeSelection({requestContext: ClientRequestContext.current, imodel: iModelDb, ids: ids, scopeId: "element"});
    // Depending on how you want to use the resulting data you can change the descriptor overrides.  The displayType sets a few standard configurations
    // https://www.itwinjs.org/reference/presentation-common/content/descriptoroverrides/?term=descriptorover
    const overrides: DescriptorOverrides = {
      displayType: DefaultContentDisplayTypes.Grid,
    }
    
    // This gets the data for each key.
    // The returned Content object (https://www.itwinjs.org/reference/presentation-common/content/content/) has two parts.  
    // The descriptor and the contentSet
    // The descriptor contains information about the items in the contentSet (https://www.itwinjs.org/reference/presentation-common/content/descriptor/)
    // The contentSet holds the actual data as an array of items (https://www.itwinjs.org/reference/presentation-common/content/item/)
    const content = await Presentation.getManager().getContent({requestContext: ClientRequestContext.current, imodel: iModelDb, rulesetOrId: RULESET , descriptor: overrides, keys});
    if (!content)
      return undefined;
  
    // This is a very simple example printing out the content of the first element
    // notice that we have both the display value and the persisted value available
    console.log(`Available properties:`);
    content.descriptor.fields.forEach((f: Field) => {
      if (f.isPropertiesField() && f.type.valueFormat === PropertyValueFormat.Primitive) {
        console.log(`    ${f.label}: ${content.contentSet[0].displayValues[f.name]}`);
        console.log(`    ${' '.repeat(f.label.length)}: ${content.contentSet[0].values[f.name]}`);
      }
    });

    iModelDb.close();
  } catch (error) {
    console.error(error.message + "\n" + error.stack);
  }
  finally {
    await IModelHost.shutdown();
  }
}

// Invoke main if Main.js is being run directly
if (require.main === module) {
  main(process);
}