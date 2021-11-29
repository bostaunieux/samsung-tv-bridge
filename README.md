# Samsung TV Bridge

Work in progress...

## Running via command line

1. Configure required parameters for the service, either using env vars, or by defining a `.env` file containing properties in the format of: `FIELD=VALUE`.
2. Install dependencies
   ```
   npm install
   ```
3. Build the service
   ```
   npm run build
   ```
4. Start the service
   ```
   npm start
   ```

## Running via docker

1. Mount a directory where the token file can be located, e.g. `/config`
2. Define all required fields via ENV vars

## Configuration

| Field      | Required | Description                           | Default  |
| ---------- | -------- | ------------------------------------- | -------- |
| TV_HOST    | Yes      | Samsung TV host (e.g. `192.168.1.10`) | N/A      |
| TOKEN_FILE | Yes      | Full path to file for storing token   | N/A      |
| NAME       | No       | Client name to use for TV connection  | TVBridge |
