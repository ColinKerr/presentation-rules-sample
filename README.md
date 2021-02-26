# Presentation Rules Example

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

## Usage

- Before you run this example replace the `urlString` in main.ts with the iModel you want to query.

- To select different elements change the `ecSql` variable to a query which selects the elements you are interested in.
  > NOTE: The first column must be the ECInstanceId.

## Commands to run

- Install

  ```npm install```

- Build
  
  ```npm run build```

- Run

  ```npm run start```

  > NOTE: The first time you run you will be taken to the browser to login and grant this program access to download the iModel.

- Debug: To debug in VS Code use the predefined `Start` profile.
